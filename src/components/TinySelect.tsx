// TinySelect — a compact, dark-styled native <select> for the header rail.
// Native on purpose: keyboard + a11y come free, and the header has no room for
// a bespoke popover. Used by the model and permission-mode pickers (v2).

interface Option {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  ariaLabel: string;
  title?: string;
}

function TinySelect({ value, options, onChange, ariaLabel, title }: Props) {
  return (
    <div className="relative inline-flex items-center">
      <select
        aria-label={ariaLabel}
        title={title}
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        className="cursor-pointer appearance-none rounded-md bg-transparent py-1 pl-2 pr-5 font-mono text-[11px] text-coal-400 outline-none transition-colors duration-150 hover:bg-coal-850 hover:text-coal-200 focus-visible:outline-2 focus-visible:outline-ember-500/60"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value} className="bg-coal-850 text-coal-200">
            {o.label}
          </option>
        ))}
      </select>
      <svg
        viewBox="0 0 24 24"
        width="10"
        height="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="pointer-events-none absolute right-1.5 text-coal-600"
      >
        <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default TinySelect;
