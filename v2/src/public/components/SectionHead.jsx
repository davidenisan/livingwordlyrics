export default function SectionHead({ kicker, title, children, id }) {
  return (
    <div className="section-head">
      <div>
        <span className="kicker">{kicker}</span>
        <h2 id={id}>{title}</h2>
      </div>
      {children}
    </div>
  )
}
