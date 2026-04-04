export function ValidatorNetworkMap() {
  return (
    <div className="map-svg-wrap" role="img" aria-label="Simplified validator network map with regional nodes">
      <svg viewBox="0 0 400 200" width="100%" height="220" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="mapBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0a1628" />
            <stop offset="100%" stopColor="#121826" />
          </linearGradient>
          <filter id="softGlow">
            <feGaussianBlur stdDeviation="1.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect width="400" height="200" fill="url(#mapBg)" rx="4" />
        {/* Abstract region shapes — schematic, not geographic caricature */}
        <path
          d="M40 120 L100 80 L140 130 L90 170 Z"
          fill="none"
          stroke="#2a3548"
          strokeWidth="1"
        />
        <path
          d="M120 50 L220 40 L240 100 L160 120 Z"
          fill="none"
          stroke="#2a3548"
          strokeWidth="1"
        />
        <path
          d="M230 90 L340 70 L360 150 L250 160 Z"
          fill="none"
          stroke="#2a3548"
          strokeWidth="1"
        />
        <path
          d="M50 40 L180 30 L200 90 L60 100 Z"
          fill="none"
          stroke="#3d5a80"
          strokeWidth="0.8"
          opacity="0.6"
        />
        {/* Links */}
        <line x1="95" y1="125" x2="175" y2="85" stroke="#64748b" strokeWidth="1" opacity="0.5" />
        <line x1="200" y1="85" x2="290" y2="110" stroke="#64748b" strokeWidth="1" opacity="0.5" />
        <line x1="130" y1="140" x2="270" y2="130" stroke="#9a8b5f" strokeWidth="0.8" opacity="0.45" />
        {/* Nodes */}
        <circle cx="95" cy="125" r="7" fill="#2563eb" filter="url(#softGlow)" />
        <circle cx="175" cy="85" r="7" fill="#9a8b5f" filter="url(#softGlow)" />
        <circle cx="290" cy="110" r="7" fill="#3d7a5c" filter="url(#softGlow)" />
        <circle cx="130" cy="140" r="5" fill="#94a3b8" />
        <circle cx="320" cy="140" r="5" fill="#94a3b8" />
        <text x="95" y="150" textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="IBM Plex Sans, sans-serif">
          NE
        </text>
        <text x="175" y="70" textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="IBM Plex Sans, sans-serif">
          MW
        </text>
        <text x="290" y="95" textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="IBM Plex Sans, sans-serif">
          W
        </text>
        <text x="40" y="24" fill="#64748b" fontSize="10" fontFamily="IBM Plex Sans, sans-serif">
          Validator network — live sync
        </text>
      </svg>
    </div>
  );
}
