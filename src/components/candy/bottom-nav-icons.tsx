import { type SVGProps } from "react";

type NavIconProps = SVGProps<SVGSVGElement> & {
  active?: boolean;
};

function IconFrame({ active = false, children, ...props }: NavIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth={active ? 2 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      vectorEffect="non-scaling-stroke"
      {...props}
    >
      {children}
    </svg>
  );
}

export function HomeNavIcon(props: NavIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M3.75 10.5 12 3.9l8.25 6.6" />
      <path d="M5.5 9.2v9.05c0 .97.78 1.75 1.75 1.75h9.5c.97 0 1.75-.78 1.75-1.75V9.2" />
      <path d="M9.25 20v-5.15c0-.75.6-1.35 1.35-1.35h2.8c.75 0 1.35.6 1.35 1.35V20" />
    </IconFrame>
  );
}

/** Magnifier icon for the Tìm kiếm tab — same stroke style as the other nav icons. */
/** 3D magnifier for "Tìm Bạn": static gradients (no filters) so it stays light on phones. */
export function SearchNavIcon({ active }: NavIconProps) {
  return (
    <span className={`search3d${active ? " search3d--active" : ""}`} aria-hidden="true">
      <svg viewBox="0 0 32 32" width="30" height="30" className="search3d__svg">
        <defs>
          <linearGradient id="s3d-rim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--search3d-rim-light)" />
            <stop offset="1" stopColor="var(--search3d-rim-dark)" />
          </linearGradient>
          <radialGradient id="s3d-glass" cx="0.35" cy="0.3" r="0.8">
            <stop offset="0" stopColor="var(--search3d-glass-light)" />
            <stop offset="1" stopColor="var(--search3d-glass-dark)" />
          </radialGradient>
          <linearGradient id="s3d-handle" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--search3d-handle-light)" />
            <stop offset="1" stopColor="var(--search3d-handle-dark)" />
          </linearGradient>
        </defs>
        <ellipse cx="15" cy="29" rx="9" ry="1.6" fill="var(--search3d-shadow)" />
        <path d="M19.6 19.4 27 26.8a2.2 2.2 0 0 1-3.1 3.1l-7.4-7.4Z" fill="var(--search3d-handle-dark)" transform="translate(0.6 0.8)" />
        <path d="M19.6 19.4 27 26.8a2.2 2.2 0 0 1-3.1 3.1l-7.4-7.4Z" fill="url(#s3d-handle)" />
        <circle cx="13.4" cy="14" r="10" fill="var(--search3d-rim-dark)" />
        <circle cx="13" cy="13.2" r="10" fill="url(#s3d-rim)" />
        <circle cx="13" cy="13.2" r="7.2" fill="url(#s3d-glass)" />
        <path d="M8.6 11.2a5 5 0 0 1 4-4" stroke="var(--search3d-shine)" strokeWidth="1.8" strokeLinecap="round" fill="none" />
      </svg>
      <span className="search3d__sheen" />
    </span>
  );
}

/** Flat group/people icon for the Nhóm tab — same stroke style as the other nav icons. */
export function GroupNavIcon(props: NavIconProps) {
  return (
    <IconFrame {...props}>
      <circle cx="9.2" cy="7.8" r="3.3" />
      <path d="M3.6 20c.6-3 2.9-4.9 5.6-4.9s5 1.9 5.6 4.9" />
      <path d="M15.3 4.8a3.3 3.3 0 0 1 0 6" />
      <path d="M17.6 15.4c1.6.7 2.8 2.4 3.1 4.6" />
    </IconFrame>
  );
}

export function ChatNavIcon(props: NavIconProps) {
  return (
    <IconFrame {...props}>
      <path d="M4 5.25h16c1.1 0 2 .9 2 2v8.25c0 1.1-.9 2-2 2h-8.25L6.2 20.6l.95-3.1H4c-1.1 0-2-.9-2-2V7.25c0-1.1.9-2 2-2Z" />
      <path d="M7.5 11.4h.01M12 11.4h.01M16.5 11.4h.01" strokeWidth="2.4" />
    </IconFrame>
  );
}

export function ProfileNavIcon(props: NavIconProps) {
  return (
    <IconFrame {...props}>
      <path d="m8.35 5.15 1.3-1.75L12 5.15l2.35-1.75 1.3 1.75" />
      <circle cx="12" cy="9.4" r="3.35" />
      <path d="M5.35 20.1c.7-3.1 3.25-5.15 6.65-5.15s5.95 2.05 6.65 5.15" />
    </IconFrame>
  );
}