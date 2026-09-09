// The Reamer mark: a hex-shank profile (precision tool shank) with a
// six-bladed turbine spinning at its center. Full letters (R-E-A-M-E-R)
// only make sense at larger sizes, so `full` is opt-in — nav/footer use
// the bare icon.
const HEX_PATH = "M110,64 L149.82,87 L149.82,133 L110,156 L70.18,133 L70.18,87 Z";
const BLADE_PATH =
  "M0,0 C14.86,-7.18 7.82,-23.68 1.56,-35.88 Q-2.50,-20.81 0,0 Z";
const BLADE_ANGLES = [0, 60, 120, 180, 240, 300];
const LETTERS = [
  { ch: "R", x: 110, y: 40 },
  { ch: "E", x: 170.89, y: 75 },
  { ch: "A", x: 170.89, y: 145 },
  { ch: "M", x: 110, y: 180 },
  { ch: "E", x: 49.11, y: 145 },
  { ch: "R", x: 49.11, y: 75 },
];

export const Logo = ({ size = 20, full = false, spin = true, className = "" }) => (
  <svg
    className={`logo-mark${spin ? " logo-mark--spin" : ""} ${className}`}
    width={size}
    height={size}
    viewBox="0 0 220 220"
    fill="none"
    aria-hidden
  >
    <path
      d={HEX_PATH}
      stroke="currentColor"
      strokeWidth="5"
      strokeLinejoin="round"
    />
    <g className="logo-mark__turbine">
      {BLADE_ANGLES.map((rot) => (
        <path
          key={rot}
          d={BLADE_PATH}
          fill="currentColor"
          transform={`translate(110 110) rotate(${rot})`}
        />
      ))}
      <circle cx="110" cy="110" r="8" fill="currentColor" />
    </g>
    {full &&
      LETTERS.map((l, i) => (
        <text
          key={i}
          x={l.x}
          y={l.y}
          fill="currentColor"
          fontFamily="'JetBrains Mono', ui-monospace, monospace"
          fontSize="30"
          fontWeight="600"
          textAnchor="middle"
          dominantBaseline="middle"
          letterSpacing="1"
        >
          {l.ch}
        </text>
      ))}
  </svg>
);

export default Logo;
