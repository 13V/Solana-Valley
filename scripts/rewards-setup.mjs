// Ops helper for the custodial $SPROUT reward system (see docs/REWARDS.md).
//
// Subcommands:
//   create-mint            Generate a treasury keypair, airdrop devnet SOL, create
//                          a test mint, and mint an initial supply to the treasury.
//                          Prints the env vars to set (REWARD_MINT, TREASURY_SECRET_KEY).
//   credit <wallet> <amt>  Credit a wallet's claimable balance by <amt> whole tokens
//                          (calls the Supabase credit_reward RPC with the service key).
//   balance                Print the treasury's on-chain token balance.
//
// Env: SOLANA_RPC_URL (default devnet), REWARD_MINT, TREASURY_SECRET_KEY (base58),
//      REWARD_DECIMALS (default 6), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//
// NEVER use a real mainnet treasury key with this tool casually — it can mint and
// move tokens. It's intended for devnet setup + crediting test wallets.

import {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  clusterApiUrl,
} from '@solana/web3.js';
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from '@solana/spl-token';
import bs58 from 'bs58';

const RPC = process.env.SOLANA_RPC_URL || clusterApiUrl('devnet');
const DECIMALS = Number(process.env.REWARD_DECIMALS ?? 6);
const cmd = process.argv[2];

function treasuryFromEnv() {
  const raw = process.env.TREASURY_SECRET_KEY;
  if (!raw) die('TREASURY_SECRET_KEY is not set');
  const secret = bs58.decode(raw.trim());
  if (secret.length !== 64) die('TREASURY_SECRET_KEY must be a 64-byte base58 secret key');
  return Keypair.fromSecretKey(secret);
}

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

// Convert a whole-token amount (possibly fractional) to base units (BigInt).
function toBaseUnits(amountStr) {
  const [whole, frac = ''] = String(amountStr).split('.');
  const fracPadded = (frac + '0'.repeat(DECIMALS)).slice(0, DECIMALS);
  return BigInt(whole || '0') * 10n ** BigInt(DECIMALS) + BigInt(fracPadded || '0');
}

async function createMintCmd() {
  const connection = new Connection(RPC, 'confirmed');
  const treasury = Keypair.generate();
  console.log('Treasury pubkey:', treasury.publicKey.toBase58());

  console.log('Requesting devnet airdrop…');
  const sig = await connection.requestAirdrop(treasury.publicKey, 2 * LAMPORTS_PER_SOL);
  await connection.confirmTransaction(sig, 'confirmed');

  console.log('Creating mint…');
  const mint = await createMint(connection, treasury, treasury.publicKey, treasury.publicKey, DECIMALS);

  console.log('Creating treasury token account + minting initial supply…');
  const ata = await getOrCreateAssociatedTokenAccount(connection, treasury, mint, treasury.publicKey);
  const supply = 1_000_000n * 10n ** BigInt(DECIMALS); // 1,000,000 tokens
  await mintTo(connection, treasury, mint, ata.address, treasury, supply);

  console.log('\n✓ Done. Set these env vars (server-only — never commit TREASURY_SECRET_KEY):\n');
  console.log(`SOLANA_RPC_URL=${RPC}`);
  console.log(`REWARD_MINT=${mint.toBase58()}`);
  console.log(`REWARD_DECIMALS=${DECIMALS}`);
  console.log(`TREASURY_SECRET_KEY=${bs58.encode(treasury.secretKey)}`);
}

async function creditCmd(wallet, amount) {
  if (!wallet || !amount) die('usage: credit <wallet> <amount>');
  new PublicKey(wallet); // validate
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) die('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  const base = toBaseUnits(amount).toString();

  const resp = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/rpc/credit_reward`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ p_wallet: wallet, p_amount: base }),
  });
  if (!resp.ok) die(`credit_reward failed: ${resp.status} ${await resp.text().catch(() => '')}`);
  console.log(`✓ Credited ${amount} tokens (${base} base units) to ${wallet}. New claimable: ${await resp.text()}`);
}

async function balanceCmd() {
  const connection = new Connection(RPC, 'confirmed');
  const treasury = treasuryFromEnv();
  const mint = new PublicKey(process.env.REWARD_MINT || die('REWARD_MINT is not set'));
  const ata = await getOrCreateAssociatedTokenAccount(connection, treasury, mint, treasury.publicKey);
  const acc = await getAccount(connection, ata.address);
  const whole = Number(acc.amount) / 10 ** DECIMALS;
  console.log(`Treasury ${treasury.publicKey.toBase58()} holds ${whole.toLocaleString()} tokens (${acc.amount} base units)`);
}

switch (cmd) {
  case 'create-mint':
    await createMintCmd();
    break;
  case 'credit':
    await creditCmd(process.argv[3], process.argv[4]);
    break;
  case 'balance':
    await balanceCmd();
    break;
  default:
    console.log('Usage: node scripts/rewards-setup.mjs <create-mint | credit <wallet> <amount> | balance>');
    process.exit(cmd ? 1 : 0);
}
