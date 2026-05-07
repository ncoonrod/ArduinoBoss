window.BOSS_SVG = `
<svg class="boss-svg" viewBox="0 0 240 240" xmlns="http://www.w3.org/2000/svg">
	<defs>
		<radialGradient id="bossBody" cx="50%" cy="50%" r="50%">
			<stop offset="0%" stop-color="#d36bff"/>
			<stop offset="60%" stop-color="#7d22cf"/>
			<stop offset="100%" stop-color="#2a0858"/>
		</radialGradient>
		<radialGradient id="eye" cx="50%" cy="50%" r="50%">
			<stop offset="0%" stop-color="#fffacd"/>
			<stop offset="40%" stop-color="#ffcb47"/>
			<stop offset="100%" stop-color="#a36300"/>
		</radialGradient>
	</defs>
	<g>
		<!-- spikes -->
		<polygon points="40,90 30,40 60,80" fill="#3b0e6a"/>
		<polygon points="200,90 210,40 180,80" fill="#3b0e6a"/>
		<polygon points="120,30 100,70 140,70" fill="#3b0e6a"/>
		<polygon points="80,40 90,75 60,70" fill="#3b0e6a"/>
		<polygon points="160,40 150,75 180,70" fill="#3b0e6a"/>
		<!-- body -->
		<ellipse cx="120" cy="130" rx="90" ry="80" fill="url(#bossBody)" stroke="#1a032e" stroke-width="3"/>

		<!-- normal face: eyes + mouth -->
		<g class="boss-face boss-face-normal">
			<ellipse cx="90" cy="120" rx="22" ry="26" fill="#fff"/>
			<ellipse cx="150" cy="120" rx="22" ry="26" fill="#fff"/>
			<circle cx="92" cy="125" r="12" fill="url(#eye)"/>
			<circle cx="148" cy="125" r="12" fill="url(#eye)"/>
			<circle cx="94" cy="123" r="5" fill="#000"/>
			<circle cx="146" cy="123" r="5" fill="#000"/>
			<rect x="70" y="170" width="100" height="10" fill="#1a032e"/>
		</g>

		<!-- hurt face: X eyes, open O mouth, sparks -->
		<g class="boss-face boss-face-hurt">
			<ellipse cx="90" cy="120" rx="22" ry="26" fill="#fff"/>
			<ellipse cx="150" cy="120" rx="22" ry="26" fill="#fff"/>
			<line x1="76" y1="106" x2="104" y2="134" stroke="#1a032e" stroke-width="7" stroke-linecap="round"/>
			<line x1="104" y1="106" x2="76" y2="134" stroke="#1a032e" stroke-width="7" stroke-linecap="round"/>
			<line x1="136" y1="106" x2="164" y2="134" stroke="#1a032e" stroke-width="7" stroke-linecap="round"/>
			<line x1="164" y1="106" x2="136" y2="134" stroke="#1a032e" stroke-width="7" stroke-linecap="round"/>
			<ellipse cx="120" cy="180" rx="32" ry="22" fill="#1a032e"/>
			<text x="40" y="100" fill="#fff" font-size="22" font-family="Impact, sans-serif">✦</text>
			<text x="190" y="100" fill="#fff" font-size="22" font-family="Impact, sans-serif">✦</text>
		</g>

		<!-- dead face: bigger X eyes, drooping mouth, tongue out -->
		<g class="boss-face boss-face-dead">
			<ellipse cx="90" cy="120" rx="22" ry="26" fill="#fff"/>
			<ellipse cx="150" cy="120" rx="22" ry="26" fill="#fff"/>
			<line x1="73" y1="103" x2="107" y2="137" stroke="#1a032e" stroke-width="9" stroke-linecap="round"/>
			<line x1="107" y1="103" x2="73" y2="137" stroke="#1a032e" stroke-width="9" stroke-linecap="round"/>
			<line x1="133" y1="103" x2="167" y2="137" stroke="#1a032e" stroke-width="9" stroke-linecap="round"/>
			<line x1="167" y1="103" x2="133" y2="137" stroke="#1a032e" stroke-width="9" stroke-linecap="round"/>
			<!-- closed/squiggly mouth -->
			<path d="M 80 175 Q 95 168 110 175 Q 125 182 140 175 Q 155 168 170 175"
				fill="none" stroke="#1a032e" stroke-width="6" stroke-linecap="round"/>
			<!-- tongue lolling out -->
			<path d="M 112 178 Q 110 210 120 218 Q 130 210 128 178 Z" fill="#ff5e8a" stroke="#a02323" stroke-width="2"/>
			<line x1="120" y1="195" x2="120" y2="212" stroke="#a02323" stroke-width="1.5"/>
		</g>

		<!-- fangs (always visible) -->
		<polygon points="90,175 95,200 100,175" fill="#fff"/>
		<polygon points="110,178 115,205 120,178" fill="#fff"/>
		<polygon points="130,178 135,205 140,178" fill="#fff"/>
		<polygon points="150,175 155,200 160,175" fill="#fff"/>
		<!-- claws -->
		<polygon points="20,160 35,180 25,140" fill="#3b0e6a"/>
		<polygon points="220,160 205,180 215,140" fill="#3b0e6a"/>
	</g>
</svg>`;
