/* Original superhero silhouettes (generic caped figures, hands on hips).
   Usage: DCAvatar.svg('male' | 'female' | 'other', '#D4A017')  ->  SVG string */
window.DCAvatar = (function () {
  let n = 0;
  const FIG = '#1c0b11';

  const cape = {
    male:   'M64 84 C44 130 36 176 30 222 L66 210 L100 226 L134 210 L170 222 C164 176 156 130 136 84 Z',
    female: 'M68 86 C50 130 44 176 38 222 L70 210 L100 224 L130 210 L162 222 C156 176 150 130 132 86 Z',
    other:  'M66 85 C47 130 40 176 34 222 L68 210 L100 225 L132 210 L166 222 C160 176 153 130 134 85 Z'
  };

  const bodies = {
    male: `
      <ellipse cx="100" cy="50" rx="15.5" ry="18.5"/>
      <rect x="93" y="64" width="14" height="14"/>
      <path d="M60 86 Q100 74 140 86 L132 108 L118 146 L82 146 L68 108 Z"/>
      <path d="M60 86 L46 92 L38 122 L60 152 L76 148 L58 122 L64 102 Z"/>
      <path d="M140 86 L154 92 L162 122 L140 152 L124 148 L142 122 L136 102 Z"/>
      <path d="M78 146 L100 146 L98 216 L72 216 Z"/>
      <path d="M100 146 L122 146 L128 216 L102 216 Z"/>
      <path d="M68 206 L99 206 L99 222 L64 222 Z"/>
      <path d="M101 206 L132 206 L136 222 L101 222 Z"/>`,
    female: `
      <path d="M82 50 C80 22 120 22 118 50 C128 72 130 98 122 120 C116 106 114 84 112 68 L88 68 C86 84 84 106 78 120 C70 98 72 72 82 50 Z"/>
      <ellipse cx="100" cy="50" rx="14.5" ry="18"/>
      <rect x="94.5" y="64" width="11" height="14"/>
      <path d="M68 88 Q100 78 132 88 L127 108 L114 130 L122 152 L78 152 L86 130 L73 108 Z"/>
      <path d="M68 88 L56 94 L50 122 L70 152 L82 148 L64 122 L69 104 Z"/>
      <path d="M132 88 L144 94 L150 122 L130 152 L118 148 L136 122 L131 104 Z"/>
      <path d="M80 150 L100 150 L97 218 L80 218 Z"/>
      <path d="M100 150 L120 150 L120 218 L103 218 Z"/>
      <path d="M76 208 L98 208 L98 222 L72 222 Z"/>
      <path d="M102 208 L124 208 L128 222 L102 222 Z"/>`,
    other: `
      <ellipse cx="100" cy="50" rx="15" ry="18.5"/>
      <rect x="93.5" y="64" width="13" height="14"/>
      <path d="M63 86 Q100 76 137 86 L130 108 L116 142 L84 142 L70 108 Z"/>
      <path d="M63 86 L50 92 L43 122 L63 150 L77 146 L60 122 L66 102 Z"/>
      <path d="M137 86 L150 92 L157 122 L137 150 L123 146 L140 122 L134 102 Z"/>
      <path d="M80 142 L100 142 L98 216 L75 216 Z"/>
      <path d="M100 142 L120 142 L125 216 L102 216 Z"/>
      <path d="M71 206 L99 206 L99 222 L67 222 Z"/>
      <path d="M101 206 L129 206 L133 222 L101 222 Z"/>`
  };

  function svg(gender, color) {
    const g = bodies[gender] ? gender : 'other';
    const id = 'av' + (++n);
    const c = /^#[0-9a-f]{6}$/i.test(color) ? color : '#9AA3AE';
    return `<svg viewBox="0 0 200 240" role="img" aria-label="Donor avatar" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="${id}c"><circle cx="100" cy="120" r="110"/></clipPath>
    <radialGradient id="${id}" cx="50%" cy="34%" r="72%">
      <stop offset="0" stop-color="#fff" stop-opacity=".55"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="100" cy="120" r="110" fill="${c}"/>
  <circle cx="100" cy="120" r="110" fill="url(#${id})"/>
  <g clip-path="url(#${id}c)">
    <path d="${cape[g]}" fill="${FIG}" opacity=".6"/>
    <g fill="${FIG}">${bodies[g]}</g>
    <path d="M91 49 l7 2 l-1 3 l-7 -2z M109 49 l-7 2 l1 3 l7 -2z" fill="#fff" opacity=".92"/>
    <path d="M100 92 C96 100 92 104 92 109 a8 8 0 0 0 16 0 C108 104 104 100 100 92 Z" fill="${c}"/>
  </g>
</svg>`;
  }
  return { svg };
})();
