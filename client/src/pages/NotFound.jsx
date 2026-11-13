import { Link } from 'react-router-dom';

const NotFound = () => {
  return (
    <div className="page-shell container center-content">
      <h2>Page not found</h2>
      <Link className="btn btn-primary" to="/">
        Go home
      </Link>
    </div>
  );
};

export default NotFound;
