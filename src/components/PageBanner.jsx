import { Link } from "react-router-dom";
import { useContent } from "../content.jsx";

// "group" is the header menu dropdown this page sits in (from the live menu the
// admin edits), so pages added from the admin show up here automatically.
export default function PageBanner({ light, bold, group, photos }) {
  const { school } = useContent();
  const pics = (photos || []).filter(Boolean).slice(0, 2);
  return (
    <section className="banner">
      <div className="container banner__inner">
        <div className="banner__text">
          <nav className="banner__crumbs" aria-label="Breadcrumb">
            <Link to="/">Home</Link>
            {group && <> › <span>{group.label}</span></>}
            {" › "}
            <span aria-current="page">{[light, bold].filter(Boolean).join(" ")}</span>
          </nav>
          <h1 className="banner__title">
            {light} <strong>{bold}</strong>
          </h1>
          <p className="banner__sub">
            {school.name}, {school.place}
          </p>
        </div>

        {pics.length > 0 && (
          <div className="banner__photos">
            {pics.map((src, i) => (
              <img key={src} src={src} alt="" className={`banner__photo banner__photo--${i === 0 ? "a" : "b"}`} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
