const svgProps = { 'aria-hidden': true, focusable: false } as const;

export function XIcon() {
  return (
    <svg className="ic" viewBox="0 0 12 12" {...svgProps}>
      <path
        d="M2 2l8 8M10 2l-8 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PlusIcon() {
  return (
    <svg className="ic" viewBox="0 0 12 12" {...svgProps}>
      <path
        d="M6 1.5v9M1.5 6h9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function WarnIcon() {
  return (
    <svg className="ic" viewBox="0 0 16 16" {...svgProps}>
      <path
        d="M8 1.8l6.6 11.4H1.4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M8 6.4v3.2M8 11.4v.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
