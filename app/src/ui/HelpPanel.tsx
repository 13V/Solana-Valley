export function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="panel help">
      <div className="panel-head">
        <h3>🌱 Welcome to Solana Valley</h3>
        <button className="x" onClick={onClose}>✕</button>
      </div>
      <div className="help-body">
        <p>Grow a farm, chase rare crops and lucky mutations, and build your fortune.</p>
        <h4>Controls</h4>
        <ul>
          <li><b>Move:</b> WASD or arrow keys</li>
          <li><b>Tools:</b> press <b>1</b> Hoe · <b>2</b> Watering Can · <b>3</b> Seeds (or click the hotbar)</li>
          <li><b>Use a tool:</b> click a tile within reach (the cursor turns red if too far)</li>
        </ul>
        <h4>The loop</h4>
        <ul>
          <li><b>Hoe</b> grass into soil → plant a <b>Seed</b> → <b>Water</b> it (watered crops grow 2× faster)</li>
          <li>Crops grow in real time. Click a <b>ripe</b> crop to harvest it.</li>
          <li>Sell your harvest in the <b>🎒 Harvest</b> panel for coins.</li>
        </ul>
        <h4>Rarity &amp; mutations</h4>
        <ul>
          <li>Seeds range from <span style={{ color: '#c3ccd4' }}>Common</span> to{' '}
            <span style={{ color: '#ff8ad8' }}>Prismatic</span> — rarer plants sell for far more.</li>
          <li>The <b>🛒 Shop</b> restocks on a timer; rare seeds only appear sometimes, so check back!</li>
          <li>On harvest, crops can roll mutations — <span style={{ color: '#ffd21a' }}>Gold</span> (×20),{' '}
            <span style={{ color: '#ff7ad0' }}>Rainbow</span> (×50), and more. Watering also adds a Wet bonus.</li>
        </ul>
        <p className="muted">
          Your farm autosaves locally. Connect a Solana wallet (devnet) to see your address &amp; balance —
          on-chain land/items and the $VALLEY token are on the roadmap.
        </p>
      </div>
    </div>
  );
}
