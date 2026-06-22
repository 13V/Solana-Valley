// Buyback bot for the custodial $LANDS reward system (see docs/REWARDS.md,
// "Funding the treasury (the buyback bot)").
//
// The treasury wallet (TREASURY_SECRET_KEY) holds SOL deposited from claimed
// fees and is BOTH the swapper and the holder: it swaps SOL → $LANDS on
// Jupiter, so the bought tokens land directly in the treasury's token account,
// ready for player claims. No separate dev wallet or extra transfer needed.
//
// Subcommands:
//   quote <solAmount> [--slippage <bps>]
//                          Dry-run: fetch a Jupiter v6 quote for swapping
//                          <solAmount> SOL → REWARD_MINT and print the expected
//                          $LANDS out + price impact. DOES NOT SEND.
//   run <solAmount> [--slippage <bps>] [--reserve <sol>]
//                          Execute the swap (quote → /swap → sign → send →
//                          confirm). Keeps --reserve SOL (default 0.05) for
//                          rent/fees; requires balance - reserve >= solAmount.
//   balance                Print the treasury's SOL balance and $LANDS balance.
//   claim-fees             Documented stub — claiming creator/LP/withheld fees is
//                          venue-specific; its job is just to deposit SOL into the
//                          treasury, after which `run` swaps it.
//
// Env: SOLANA_RPC_URL (default devnet), REWARD_MINT (required), TREASURY_SECRET_KEY
//      (base58, 64 bytes), REWARD_DECIMALS (default 6), JUPITER_API
//      (default https://quote-api.jup.ag/v6).
//
// NEVER point this at a real mainnet treasury key casually — it moves real SOL.

import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  getAssociatedTokenAddressSync,
  getAccount,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from '@solana/spl-token';
import bs58 from 'bs58';

const RPC = process.env.SOLANA_RPC_URL || clusterApiUrl('devnet');
const DECIMALS = Number(process.env.REWARD_DECIMALS ?? 6);
const JUPITER_API = process.env.JUPITER_API || 'https://quote-api.jup.ag/v6';
// PumpPortal local-transaction API, used by `claim-fees --auto` to collect
// pump.fun creator fees. VERIFY the endpoint + action against current docs
// (https://pumpportal.fun) before relying on it — the manual path always works.
const PUMPPORTAL_API = process.env.PUMPPORTAL_API || 'https://pumpportal.fun/api/trade-local';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const DEFAULT_SLIPPAGE_BPS = 100; // 1%
const DEFAULT_RESERVE_SOL = 0.05; // kept for rent/fees
const cmd = process.argv[2];

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function treasuryFromEnv() {
  const raw = process.env.TREASURY_SECRET_KEY;
  if (!raw) die('TREASURY_SECRET_KEY is not set');
  const secret = bs58.decode(raw.trim());
  if (secret.length !== 64) die('TREASURY_SECRET_KEY must be a 64-byte base58 secret key');
  return Keypair.fromSecretKey(secret);
}

function rewardMintFromEnv() {
  const raw = process.env.REWARD_MINT;
  if (!raw) die('REWARD_MINT is not set');
  try {
    return new PublicKey(raw.trim());
  } catch {
    return die('REWARD_MINT is not a valid public key');
  }
}

// Parse a flag with a value from argv regardless of position. Supports both
// `--flag value` and `--flag=value`. Returns undefined if absent.
function flagValue(name) {
  const argv = process.argv.slice(3);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === name) return argv[i + 1];
    if (arg.startsWith(`${name}=`)) return arg.slice(name.length + 1);
  }
  return undefined;
}

// The first non-flag positional after the subcommand (e.g. the SOL amount).
function firstPositional() {
  const argv = process.argv.slice(3);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      // Skip a following value if this is the `--flag value` form.
      if (!arg.includes('=') && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) i++;
      continue;
    }
    return arg;
  }
  return undefined;
}

function parsePositiveNumber(value, label) {
  if (value === undefined) die(`missing ${label}`);
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) die(`${label} must be a positive number (got "${value}")`);
  return n;
}

function parseSlippage() {
  const raw = flagValue('--slippage');
  if (raw === undefined) return DEFAULT_SLIPPAGE_BPS;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) die(`--slippage must be a positive integer in bps (got "${raw}")`);
  return n;
}

function parseReserve() {
  const raw = flagValue('--reserve');
  if (raw === undefined) return DEFAULT_RESERVE_SOL;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) die(`--reserve must be a non-negative number of SOL (got "${raw}")`);
  return n;
}

// Fetch a Jupiter v6 quote for solAmount SOL → REWARD_MINT.
async function fetchQuote(outputMint, solAmount, slippageBps) {
  const lamports = Math.round(solAmount * LAMPORTS_PER_SOL);
  const url =
    `${JUPITER_API}/quote?inputMint=${SOL_MINT}` +
    `&outputMint=${outputMint.toBase58()}` +
    `&amount=${lamports}` +
    `&slippageBps=${slippageBps}`;
  let resp;
  try {
    resp = await fetch(url);
  } catch (e) {
    return die(`Jupiter quote request failed: ${e.message || e}`);
  }
  if (!resp.ok) die(`Jupiter quote failed: ${resp.status} ${await resp.text().catch(() => '')}`);
  const quote = await resp.json().catch(() => die('Jupiter quote returned invalid JSON'));
  if (!quote || !quote.outAmount) die(`Jupiter returned no route for ${solAmount} SOL → ${outputMint.toBase58()}`);
  return quote;
}

function humanFromBaseUnits(baseUnits) {
  return Number(baseUnits) / 10 ** DECIMALS;
}

async function quoteCmd() {
  const solAmount = parsePositiveNumber(firstPositional(), '<solAmount>');
  const slippageBps = parseSlippage();
  const outputMint = rewardMintFromEnv();

  const quote = await fetchQuote(outputMint, solAmount, slippageBps);
  const outHuman = humanFromBaseUnits(quote.outAmount);
  const impact = Number(quote.priceImpactPct ?? 0) * 100;

  console.log(`Quote (dry-run, nothing sent):`);
  console.log(`  In:            ${solAmount} SOL`);
  console.log(`  Expected out:  ${outHuman.toLocaleString()} $LANDS (${quote.outAmount} base units)`);
  console.log(`  Price impact:  ${impact.toFixed(4)}%`);
  console.log(`  Slippage:      ${slippageBps} bps`);
}

async function runCmd() {
  const solAmount = parsePositiveNumber(firstPositional(), '<solAmount>');
  const slippageBps = parseSlippage();
  const reserve = parseReserve();

  const connection = new Connection(RPC, 'confirmed');
  const treasury = treasuryFromEnv();
  const outputMint = rewardMintFromEnv();

  // SAFETY: ensure we keep `reserve` SOL for rent/fees after the swap.
  const balanceLamports = await connection.getBalance(treasury.publicKey);
  const balanceSol = balanceLamports / LAMPORTS_PER_SOL;
  const spendable = balanceSol - reserve;
  if (spendable < solAmount) {
    die(
      `insufficient SOL: treasury holds ${balanceSol} SOL, reserve is ${reserve} SOL, ` +
        `so only ${spendable} SOL is spendable but ${solAmount} SOL was requested`,
    );
  }

  console.log(`Fetching quote for ${solAmount} SOL → $LANDS (slippage ${slippageBps} bps)…`);
  const quote = await fetchQuote(outputMint, solAmount, slippageBps);
  console.log(`Expected out: ${humanFromBaseUnits(quote.outAmount).toLocaleString()} $LANDS`);

  console.log('Requesting swap transaction from Jupiter…');
  let swapResp;
  try {
    swapResp = await fetch(`${JUPITER_API}/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: treasury.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
      }),
    });
  } catch (e) {
    return die(`Jupiter swap request failed: ${e.message || e}`);
  }
  if (!swapResp.ok) die(`Jupiter swap failed: ${swapResp.status} ${await swapResp.text().catch(() => '')}`);
  const swapJson = await swapResp.json().catch(() => die('Jupiter swap returned invalid JSON'));
  if (!swapJson || !swapJson.swapTransaction) die('Jupiter swap returned no swapTransaction');

  console.log('Signing and sending…');
  const tx = VersionedTransaction.deserialize(Buffer.from(swapJson.swapTransaction, 'base64'));
  tx.sign([treasury]);

  let signature;
  try {
    signature = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  } catch (e) {
    return die(`sendRawTransaction failed: ${e.message || e}`);
  }

  console.log(`Submitted: ${signature}`);
  console.log('Confirming…');
  try {
    const latest = await connection.getLatestBlockhash('confirmed');
    const result = await connection.confirmTransaction(
      { signature, blockhash: latest.blockhash, lastValidBlockHeight: latest.lastValidBlockHeight },
      'confirmed',
    );
    if (result.value?.err) die(`transaction failed on-chain: ${JSON.stringify(result.value.err)} (sig ${signature})`);
  } catch (e) {
    return die(`confirmation failed: ${e.message || e} (check the signature on-chain: ${signature})`);
  }

  console.log(`\n✓ Swapped ${solAmount} SOL → $LANDS into the treasury.`);
  console.log(`  Signature: ${signature}`);
  console.log(`  Solscan:   https://solscan.io/tx/${signature}`);
}

async function balanceCmd() {
  const connection = new Connection(RPC, 'confirmed');
  const treasury = treasuryFromEnv();
  const mint = rewardMintFromEnv();

  const lamports = await connection.getBalance(treasury.publicKey);
  const sol = lamports / LAMPORTS_PER_SOL;

  const ata = getAssociatedTokenAddressSync(mint, treasury.publicKey);
  let sproutBase = 0n;
  try {
    const acc = await getAccount(connection, ata);
    sproutBase = acc.amount;
  } catch (e) {
    // ATA not created yet (or owned by another program) → treat as 0.
    if (!(e instanceof TokenAccountNotFoundError) && !(e instanceof TokenInvalidAccountOwnerError)) {
      return die(`failed to read $LANDS token account: ${e.message || e}`);
    }
  }
  const sproutHuman = Number(sproutBase) / 10 ** DECIMALS;

  console.log(`Treasury ${treasury.publicKey.toBase58()}:`);
  console.log(`  SOL:     ${sol} SOL`);
  console.log(`  $LANDS: ${sproutHuman.toLocaleString()} (${sproutBase} base units)`);
}

// Collect pump.fun creator fees into the treasury. Default prints the runbook;
// `--auto` attempts an automated collect via PumpPortal, signed by the treasury
// (which should ALSO be the token's creator wallet, so fees accrue here).
async function claimFeesCmd() {
  if (!process.argv.includes('--auto')) {
    console.log(`pump.fun creator-fee collection
================================
$LANDS creator fees (SOL) accrue to the wallet that LAUNCHED the token on
pump.fun — so launch $LANDS FROM the treasury wallet and they land right here.

Turn fees into claimable $LANDS in two steps:
  1. Collect creator fees → SOL in the treasury, EITHER:
       • pump.fun UI: your coin page → "claim creator rewards", OR
       • automated:   node scripts/buyback.mjs claim-fees --auto
  2. Swap that SOL → $LANDS into the treasury:
       node scripts/buyback.mjs run <solAmount>

Treasury key: ${process.env.TREASURY_SECRET_KEY ? 'configured' : 'TREASURY_SECRET_KEY not set'}
(Run this loop on a cron to keep the treasury funded from real revenue.)`);
    process.exit(0);
  }

  // --auto: best-effort automated collect via PumpPortal's local-tx API.
  const treasury = treasuryFromEnv();
  const connection = new Connection(RPC, 'confirmed');
  console.log('Collecting pump.fun creator fees via PumpPortal (best-effort)…');
  let resp;
  try {
    resp = await fetch(PUMPPORTAL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: treasury.publicKey.toBase58(),
        action: 'collectCreatorFee',
        priorityFee: 0.00001,
      }),
    });
  } catch (e) {
    return die(
      `PumpPortal request failed: ${e.message || e}\n` +
        'Claim manually in the pump.fun UI, then: node scripts/buyback.mjs run <solAmount>',
    );
  }
  if (!resp.ok) {
    return die(
      `PumpPortal collectCreatorFee failed: ${resp.status} ${await resp.text().catch(() => '')}\n` +
        'Verify the action/endpoint at https://pumpportal.fun, or claim manually in the pump.fun UI ' +
        'then: node scripts/buyback.mjs run <solAmount>',
    );
  }
  let sig;
  try {
    const raw = new Uint8Array(await resp.arrayBuffer());
    const tx = VersionedTransaction.deserialize(raw);
    tx.sign([treasury]);
    sig = await connection.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
    await connection.confirmTransaction(sig, 'confirmed');
  } catch (e) {
    return die(`collect transaction failed: ${e.message || e}`);
  }
  console.log(`✓ Collected creator fees to the treasury. Sig: ${sig}`);
  console.log('Now swap that SOL into $LANDS:  node scripts/buyback.mjs run <solAmount>');
}

switch (cmd) {
  case 'quote':
    await quoteCmd();
    break;
  case 'run':
    await runCmd();
    break;
  case 'balance':
    await balanceCmd();
    break;
  case 'claim-fees':
    await claimFeesCmd();
    break;
  default:
    console.log(
      'Usage: node scripts/buyback.mjs <quote <solAmount> [--slippage <bps>] | ' +
        'run <solAmount> [--slippage <bps>] [--reserve <sol>] | balance | claim-fees>',
    );
    process.exit(cmd ? 1 : 0);
}
