interface CollapsibleSectionProps {
  title: string;
  icon?: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

export function CollapsibleSection({ title, icon, open, onToggle, children }: CollapsibleSectionProps) {
  return (
    <div className="panel-section-block" data-open={open}>
      <span className="panel-section-tick" aria-hidden="true" />
      <button className="panel-section-header" onClick={onToggle} aria-expanded={open}>
        <span className="panel-section-chevron">{open ? '▾' : '▸'}</span>
        {icon != null && <span className="panel-section-icon">{icon}</span>}
        <span className="panel-section-title">{title}</span>
      </button>
      {open && <div className="panel-section-body">{children}</div>}
    </div>
  );
}