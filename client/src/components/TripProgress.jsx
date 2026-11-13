const STATUS_ORDER = ['pending', 'accepted', 'in_progress', 'completed'];

const STATUS_LABELS = {
  pending: 'Booked',
  accepted: 'Accepted',
  in_progress: 'On the way',
  completed: 'Completed',
};

const TripProgress = ({ status }) => {
  const activeIndex = Math.max(0, STATUS_ORDER.indexOf(status) >= 0 ? STATUS_ORDER.indexOf(status) : 0);

  return (
    <div className="trip-progress" aria-label="Ride progress">
      {STATUS_ORDER.map((step, index) => {
        const isDone = index <= activeIndex;
        const isCurrent = index === activeIndex;

        return (
          <div key={step} className={`trip-step ${isDone ? 'done' : ''} ${isCurrent ? 'current' : ''}`}>
            <span className="trip-step-dot" />
            <small>{STATUS_LABELS[step]}</small>
          </div>
        );
      })}
    </div>
  );
};

export default TripProgress;
