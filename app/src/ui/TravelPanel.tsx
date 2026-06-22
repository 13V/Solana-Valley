import { bus } from '../game/EventBus';

// The four destinations the boat can sail to. Ids match FarmScene.travelTo().
const ISLANDS: Array<{ id: string; name: string; img: string; blurb: string }> = [
  { id: 'farm', name: 'Farm', img: 'island_farm.png', blurb: 'Your home & crops' },
  { id: 'chicken', name: 'Chicken Coop', img: 'island_chicken.png', blurb: 'Collect fresh eggs' },
  { id: 'cow', name: 'Cow Pasture', img: 'island_cow.png', blurb: 'Gather creamy milk' },
  { id: 'hub', name: 'The Hub', img: 'island_hub.png', blurb: 'Plaza, pond & market' },
];

export function TravelPanel({ onClose }: { onClose: () => void }) {
  const sail = (id: string) => {
    bus.emit('ui:travel', id);
    onClose();
  };

  return (
    <div className="panel travel">
      <div className="panel-head">
        <h3>⛵ Set Sail</h3>
        <span className="muted">Where to, captain?</span>
        <button className="x" onClick={onClose} aria-label="Close">
          <img className="ui-x" src="assets/sprout-ui/ui_x.png" alt="✕" />
        </button>
      </div>
      <div className="travel-grid">
        {ISLANDS.map((is) => (
          <button key={is.id} className="island-card" onClick={() => sail(is.id)} title={`Sail to ${is.name}`}>
            <span className="island-thumb">
              <img src={`assets/sprout-ui/${is.img}`} alt="" />
            </span>
            <span className="island-name">{is.name}</span>
            <span className="island-blurb">{is.blurb}</span>
            <span className="btn sm gold island-go" aria-hidden="true">Set sail</span>
          </button>
        ))}
      </div>
    </div>
  );
}
