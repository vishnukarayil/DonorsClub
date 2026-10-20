/* Minimal masked-hero busts: head to mid-chest, shoulders covered, cape behind.
   Original silhouettes. Usage: DCAvatar.svg('male' | 'female' | 'other', '#D4A017') -> SVG string */
window.DCAvatar = (function () {
  let n = 0;
  const FIG = '#1c0b11';      // silhouette
  const HAIR = '#4a2330';     // hair, a shade lighter so the hairline reads
  const MASK = '#0b0407';     // eye mask, a shade darker

  const shapes = {
    male: {
      cape: 'M12 216 C12 150 40 118 72 110 L128 110 C160 118 188 150 188 216 Z M84 126 L72 106 L94 118 Z M116 126 L128 106 L106 118 Z',
      body: 'M22 216 C24 160 50 134 84 126 L100 138 L116 126 C150 134 176 160 178 216 Z',
      neck: 'M89 98 H111 V132 Q100 140 89 132 Z',
      head: 'M76 72 C76 50 88 44 100 44 C112 44 124 50 124 72 C124 92 114 105 100 105 C86 105 76 92 76 72 Z',
      hair: 'M75 74 C72 46 90 37 100 37 C112 37 128 46 125 74 C120 62 112 57 100 57 C88 57 80 62 75 74 Z',
      extra: ''
    },
    female: {
      cape: 'M20 216 C20 152 46 120 74 112 L126 112 C154 120 180 152 180 216 Z M86 128 L76 108 L95 119 Z M114 128 L124 108 L105 119 Z',
      body: 'M30 216 C32 164 56 138 86 128 L100 138 L114 128 C144 138 168 164 170 216 Z',
      neck: 'M91 98 H109 V132 Q100 138 91 132 Z',
      head: 'M78 72 C78 50 89 44 100 44 C111 44 122 50 122 72 C122 91 113 104 100 104 C87 104 78 91 78 72 Z',
      hair: 'M77 74 C74 46 90 37 100 37 C112 37 126 46 123 74 C118 62 112 57 100 57 C88 57 82 62 77 74 Z',
      extra: 'M117 50 C150 46 162 88 148 128 C148 104 138 88 124 78 Z'   // ponytail
    },
    other: {
      cape: 'M16 216 C16 150 43 119 73 111 L127 111 C157 119 184 150 184 216 Z M85 127 L74 107 L95 118 Z M115 127 L126 107 L105 118 Z',
      body: 'M26 216 C28 162 52 136 85 127 L100 138 L115 127 C148 136 172 162 174 216 Z',
      neck: 'M90 98 H110 V132 Q100 139 90 132 Z',
      head: 'M77 72 C77 50 88 44 100 44 C112 44 123 50 123 72 C123 91 114 104 100 104 C86 104 77 91 77 72 Z',
      hair: 'M76 73 C74 47 90 39 100 39 C111 39 126 47 124 73 C119 63 112 58 100 58 C88 58 81 63 76 73 Z',
      extra: ''
    }
  };

  function svg(gender, color) {
    const s = shapes[gender] || shapes.other;
    const id = 'av' + (++n);
    const c = /^#[0-9a-f]{6}$/i.test(color) ? color : '#9AA3AE';
    return `<svg viewBox="0 0 200 200" role="img" aria-label="Donor avatar" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="${id}c"><circle cx="100" cy="100" r="98"/></clipPath>
    <radialGradient id="${id}" cx="50%" cy="30%" r="75%">
      <stop offset="0" stop-color="#fff" stop-opacity=".55"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="100" cy="100" r="98" fill="${c}"/>
  <circle cx="100" cy="100" r="98" fill="url(#${id})"/>
  <g clip-path="url(#${id}c)">
    <g transform="translate(0 -13)">
      <path d="${s.cape}" fill="${FIG}" opacity=".62"/>
      ${s.extra ? `<path d="${s.extra}" fill="${HAIR}" transform="translate(0 13)"/>` : ''}
      <path d="${s.body}" fill="${FIG}"/>
      <path d="${s.neck}" fill="${FIG}"/>
    </g>
    <path d="${s.head}" fill="${FIG}"/>
    <path d="${s.hair}" fill="${HAIR}"/>
    <path d="M76 70 Q100 62 124 70 L123 83 Q100 77 77 83 Z" fill="${MASK}"/>
    <path d="M84 75 l11 1.500 l-1 3.500 l-10 -2 Z M116 75 l-11 1.500 l1 3.500 l10 -2 Z" fill="#fff" opacity=".95"/>
    <path d="M100 146 C95 155 90 160 90 166 a10 10 0 0 0 20 0 C110 160 105 155 100 146 Z" fill="${c}"/>
  </g>
</svg>`;
  }
  return { svg };
})();
