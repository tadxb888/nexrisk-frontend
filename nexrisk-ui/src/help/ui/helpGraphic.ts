// help/ui/helpGraphic.ts — Taiga architecture (dark bg; arrows removed; bottom items centred in band)
export const HELP_GRAPHIC = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="auto" viewBox="0 0 1300 1300" font-family="Poppins, 'Segoe UI', sans-serif">
<defs><radialGradient id="g_trader" gradientUnits="userSpaceOnUse" cx="650" cy="655" r="340"><stop offset="0%" stop-color="#ffffff"/><stop offset="55%" stop-color="#ffffff"/><stop offset="100%" stop-color="#eaf1fd"/></radialGradient><radialGradient id="g_risk" gradientUnits="userSpaceOnUse" cx="650" cy="655" r="340"><stop offset="0%" stop-color="#ffffff"/><stop offset="55%" stop-color="#ffffff"/><stop offset="100%" stop-color="#f0ecfa"/></radialGradient><radialGradient id="g_exposure" gradientUnits="userSpaceOnUse" cx="650" cy="655" r="340"><stop offset="0%" stop-color="#ffffff"/><stop offset="55%" stop-color="#ffffff"/><stop offset="100%" stop-color="#fdefe3"/></radialGradient><radialGradient id="g_execution" gradientUnits="userSpaceOnUse" cx="650" cy="655" r="340"><stop offset="0%" stop-color="#ffffff"/><stop offset="55%" stop-color="#ffffff"/><stop offset="100%" stop-color="#e5f6f4"/></radialGradient><radialGradient id="g_analytics" gradientUnits="userSpaceOnUse" cx="650" cy="655" r="340"><stop offset="0%" stop-color="#ffffff"/><stop offset="55%" stop-color="#ffffff"/><stop offset="100%" stop-color="#e9f2fb"/></radialGradient><radialGradient id="g_coverage" gradientUnits="userSpaceOnUse" cx="650" cy="655" r="340"><stop offset="0%" stop-color="#ffffff"/><stop offset="55%" stop-color="#ffffff"/><stop offset="100%" stop-color="#f9f1df"/></radialGradient><linearGradient id="g_blue" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0%" stop-color="#3273cf"/><stop offset="100%" stop-color="#2ba6c4"/></linearGradient><linearGradient id="g_gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#e2ac47"/><stop offset="100%" stop-color="#c68a2c"/></linearGradient><linearGradient id="tg_logo" x1="0" y1="0.1" x2="1" y2="0.9"><stop offset="0" stop-color="#8AA6B6"/><stop offset="1" stop-color="#C3C2A4"/></linearGradient><filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#9aa7bd" flood-opacity="0.20"/></filter></defs>

<circle cx="650" cy="655" r="622" fill="none" stroke="#e7ebf2" stroke-width="1.5"/>
<circle cx="650" cy="655" r="405" fill="none" stroke="#e7ebf2" stroke-width="1.5"/>








<defs><marker id="ah1" markerWidth="9" markerHeight="9" refX="6" refY="4.5" orient="auto"><path d="M0,0 L8,4.5 L0,9 Z" fill="#3f6ea8"/></marker><marker id="ah0" markerWidth="9" markerHeight="9" refX="2" refY="4.5" orient="auto"><path d="M8,0 L0,4.5 L8,9 Z" fill="#3f6ea8"/></marker></defs>
<path d="M 787.60 344.09 A 340.00 340.00 0 0 0 512.40 344.09 Q 498.82 350.46 505.49 363.89 L 573.08 500.04 Q 579.75 513.48 593.48 507.46 A 158.00 158.00 0 0 1 706.52 507.46 Q 720.25 513.48 726.92 500.04 L 794.51 363.89 Q 801.18 350.46 787.60 344.09 Z" fill="url(#g_trader)" stroke="#3f7fe6" stroke-width="1.6" filter="url(#soft)"/>
<g transform="translate(650.0,347.0) scale(1.02)" fill="none" stroke="#3f7fe6" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="-9" cy="-8" r="5.6"/><path d="M -18 11 Q -18 0 -9 0 Q -1 0 -1 8"/><line x1="6" y1="11" x2="6" y2="4" stroke-width="4"/><line x1="13" y1="11" x2="13" y2="-2" stroke-width="4"/><line x1="20" y1="11" x2="20" y2="-8" stroke-width="4"/></g>
<text x="650.0" y="393.0" text-anchor="middle" font-size="16.5" font-weight="700" fill="#1e3352" letter-spacing="0.3">TRADER</text>
<text x="650.0" y="414.0" text-anchor="middle" font-size="16.5" font-weight="700" fill="#1e3352" letter-spacing="0.3">INTELLIGENCE</text>
<text x="650.0" y="441.0" text-anchor="middle" font-size="13" font-weight="400" fill="#6b7a90">Behavioral profiling,</text>
<text x="650.0" y="459.0" text-anchor="middle" font-size="13" font-weight="400" fill="#6b7a90">classification and</text>
<text x="650.0" y="477.0" text-anchor="middle" font-size="13" font-weight="400" fill="#6b7a90">toxic flow detection.</text>
<path d="M 988.06 618.71 A 340.00 340.00 0 0 0 850.46 380.38 Q 838.15 371.81 829.85 384.30 L 745.74 510.90 Q 737.44 523.40 749.52 532.28 A 158.00 158.00 0 0 1 806.04 630.18 Q 807.69 645.08 822.66 644.14 L 974.36 634.59 Q 989.33 633.65 988.06 618.71 Z" fill="url(#g_risk)" stroke="#7c5cd6" stroke-width="1.6" filter="url(#soft)"/>
<g transform="translate(867.4,472.5) scale(1.02)" fill="none" stroke="#7c5cd6" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M 0 -19 L 15 -12 L 15 2 Q 15 15 0 21 Q -15 15 -15 2 L -15 -12 Z"/><polyline points="-6.5,-1 -1,5 8,-7"/></g>
<text x="867.4" y="518.5" text-anchor="middle" font-size="16.5" font-weight="700" fill="#1e3352" letter-spacing="0.3">RISK</text>
<text x="867.4" y="539.5" text-anchor="middle" font-size="16.5" font-weight="700" fill="#1e3352" letter-spacing="0.3">MANAGEMENT</text>
<text x="867.4" y="566.5" text-anchor="middle" font-size="13" font-weight="400" fill="#6b7a90">Real-time monitoring,</text>
<text x="867.4" y="584.5" text-anchor="middle" font-size="13" font-weight="400" fill="#6b7a90">limits, alerts and</text>
<text x="867.4" y="602.5" text-anchor="middle" font-size="13" font-weight="400" fill="#6b7a90">risk scoring.</text>
<path d="M 850.46 929.62 A 340.00 340.00 0 0 0 988.06 691.29 Q 989.33 676.35 974.36 675.41 L 822.66 665.86 Q 807.69 664.92 806.04 679.82 A 158.00 158.00 0 0 1 749.52 777.72 Q 737.44 786.60 745.74 799.10 L 829.85 925.70 Q 838.15 938.19 850.46 929.62 Z" fill="url(#g_exposure)" stroke="#ef7d2b" stroke-width="1.6" filter="url(#soft)"/>
<g transform="translate(867.4,723.5) scale(1.02)" fill="none" stroke="#ef7d2b" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="-13" y1="12" x2="-13" y2="2" stroke-width="5"/><line x1="0" y1="12" x2="0" y2="-6" stroke-width="5"/><line x1="13" y1="12" x2="13" y2="-13" stroke-width="5"/></g>
<text x="867.4" y="769.5" text-anchor="middle" font-size="16.5" font-weight="700" fill="#1e3352" letter-spacing="0.3">EXPOSURE</text>
<text x="867.4" y="790.5" text-anchor="middle" font-size="16.5" font-weight="700" fill="#1e3352" letter-spacing="0.3">MANAGEMENT</text>
<text x="867.4" y="817.5" text-anchor="middle" font-size="13" font-weight="400" fill="#6b7a90">Multi-dimensional</text>
<text x="867.4" y="835.5" text-anchor="middle" font-size="13" font-weight="400" fill="#6b7a90">exposure, netting and</text>
<text x="867.4" y="853.5" text-anchor="middle" font-size="13" font-weight="400" fill="#6b7a90">concentration control.</text>
<path d="M 512.40 965.91 A 340.00 340.00 0 0 0 787.60 965.91 Q 801.18 959.54 794.51 946.11 L 726.92 809.96 Q 720.25 796.52 706.52 802.54 A 158.00 158.00 0 0 1 593.48 802.54 Q 579.75 796.52 573.08 809.96 L 505.49 946.11 Q 498.82 959.54 512.40 965.91 Z" fill="url(#g_execution)" stroke="#2fb3a7" stroke-width="1.6" filter="url(#soft)"/>
<g transform="translate(650.0,849.0) scale(1.02)" fill="none" stroke="#2fb3a7" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="0" cy="0" r="12.5"/><circle cx="0" cy="0" r="3.2" fill="#2fb3a7" stroke="none"/><line x1="0" y1="-19" x2="0" y2="-14"/><line x1="0" y1="14" x2="0" y2="19"/><line x1="-19" y1="0" x2="-14" y2="0"/><line x1="14" y1="0" x2="19" y2="0"/></g>
<text x="650.0" y="895.0" text-anchor="middle" font-size="16.5" font-weight="700" fill="#1e3352" letter-spacing="0.3">EXECUTION</text>
<text x="650.0" y="916.0" text-anchor="middle" font-size="16.5" font-weight="700" fill="#1e3352" letter-spacing="0.3">MANAGEMENT</text>
<text x="650.0" y="943.0" text-anchor="middle" font-size="13" font-weight="400" fill="#6b7a90">Smart routing, order</text>
<text x="650.0" y="961.0" text-anchor="middle" font-size="13" font-weight="400" fill="#6b7a90">management and</text>
<text x="650.0" y="979.0" text-anchor="middle" font-size="13" font-weight="400" fill="#6b7a90">automated actions.</text>
<path d="M 311.94 691.29 A 340.00 340.00 0 0 0 449.54 929.62 Q 461.85 938.19 470.15 925.70 L 554.26 799.10 Q 562.56 786.60 550.48 777.72 A 158.00 158.00 0 0 1 493.96 679.82 Q 492.31 664.92 477.34 665.86 L 325.64 675.41 Q 310.67 676.35 311.94 691.29 Z" fill="url(#g_analytics)" stroke="#4a90d9" stroke-width="1.6" filter="url(#soft)"/>
<g transform="translate(432.6,723.5) scale(1.02)" fill="none" stroke="#4a90d9" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="-17,-15 -17,13 17,13" stroke-opacity="0.45"/><polyline points="-13,7 -4,-2 2,3 13,-11"/><circle cx="13" cy="-11" r="3.4" fill="#4a90d9" stroke="none"/></g>
<text x="432.6" y="769.5" text-anchor="middle" font-size="16.5" font-weight="700" fill="#1e3352" letter-spacing="0.3">MARKET</text>
<text x="432.6" y="790.5" text-anchor="middle" font-size="16.5" font-weight="700" fill="#1e3352" letter-spacing="0.3">ANALYTICS</text>
<text x="432.6" y="817.5" text-anchor="middle" font-size="13" font-weight="400" fill="#6b7a90">Predictions, scenario</text>
<text x="432.6" y="835.5" text-anchor="middle" font-size="13" font-weight="400" fill="#6b7a90">analysis and</text>
<text x="432.6" y="853.5" text-anchor="middle" font-size="13" font-weight="400" fill="#6b7a90">opportunity discovery.</text>
<path d="M 449.54 380.38 A 340.00 340.00 0 0 0 311.94 618.71 Q 310.67 633.65 325.64 634.59 L 477.34 644.14 Q 492.31 645.08 493.96 630.18 A 158.00 158.00 0 0 1 550.48 532.28 Q 562.56 523.40 554.26 510.90 L 470.15 384.30 Q 461.85 371.81 449.54 380.38 Z" fill="url(#g_coverage)" stroke="#d8a33e" stroke-width="1.6" filter="url(#soft)"/>
<g transform="translate(432.6,472.5) scale(1.02)" fill="none" stroke="#d8a33e" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M 0 -19 L 15 -12 L 15 2 Q 15 15 0 21 Q -15 15 -15 2 L -15 -12 Z"/><polyline points="-6.5,-1 -1,5 8,-7"/></g>
<text x="432.6" y="518.5" text-anchor="middle" font-size="16.5" font-weight="700" fill="#1e3352" letter-spacing="0.3">COVERAGE &amp;</text>
<text x="432.6" y="539.5" text-anchor="middle" font-size="16.5" font-weight="700" fill="#1e3352" letter-spacing="0.3">HEDGING</text>
<text x="432.6" y="566.5" text-anchor="middle" font-size="13" font-weight="400" fill="#6b7a90">Dynamic hedging,</text>
<text x="432.6" y="584.5" text-anchor="middle" font-size="13" font-weight="400" fill="#6b7a90">book balancing and</text>
<text x="432.6" y="602.5" text-anchor="middle" font-size="13" font-weight="400" fill="#6b7a90">protective actions.</text>
<circle cx="650" cy="655" r="150" fill="#ffffff" stroke="#e4e8f0" stroke-width="1.5"/>
<g transform="translate(650,610) scale(0.08427) translate(-1051.0,-1050.5)"><g transform="translate(210,210)"><g transform="translate(0,1680) scale(0.1,-0.1)"><path d="M14240 15011 c-411 -91 -611 -263 -981 -846 -83 -132 -234 -366 -334
-520 -100 -154 -241 -372 -312 -485 -71 -113 -210 -329 -308 -480 -443 -684
-678 -1049 -829 -1288 -596 -941 -610 -957 -760 -868 -56 33 -299 387 -636
926 -56 91 -164 260 -240 375 -284 435 -450 691 -673 1040 -126 198 -271 421
-321 495 -51 74 -132 198 -180 275 -80 125 -163 254 -448 690 -408 626 -937
836 -1463 580 -215 -104 -335 -224 -670 -675 -168 -225 -706 -945 -947 -1265
-410 -545 -1002 -1336 -1148 -1534 -307 -416 -835 -1114 -884 -1168 -105 -117
-215 -140 -416 -88 -673 173 -1328 -364 -1287 -1054 11 -181 36 -264 149 -488
111 -220 109 -260 -27 -543 -144 -300 -166 -466 -98 -740 135 -545 709 -875
1273 -733 255 64 328 25 570 -306 58 -78 254 -342 435 -585 182 -244 402 -542
490 -662 88 -120 315 -426 505 -680 190 -254 431 -578 535 -720 105 -142 316
-428 470 -635 154 -207 348 -468 430 -580 503 -683 957 -851 1533 -568 313
155 320 163 1103 1394 432 680 504 793 604 945 128 193 460 714 653 1020 298
475 609 948 653 992 111 112 216 67 349 -148 30 -49 149 -237 266 -419 116
-181 258 -406 316 -500 58 -93 152 -242 210 -330 58 -88 215 -333 350 -545
135 -212 323 -506 418 -655 95 -148 263 -412 373 -585 621 -977 726 -1104
1002 -1219 861 -359 1712 434 1416 1317 -63 190 -101 256 -399 717 -250 385
-333 514 -527 820 -88 138 -243 377 -345 532 -102 155 -242 371 -311 480 -69
109 -204 317 -299 463 -95 146 -250 384 -343 530 -94 146 -240 373 -327 505
-86 132 -209 323 -274 425 -65 102 -178 280 -252 395 -246 385 -246 384 45
847 97 156 200 317 228 359 73 108 481 743 641 999 74 118 160 253 192 300 31
47 144 222 250 390 106 168 295 463 420 655 124 193 246 382 270 420 50 82
409 642 615 960 397 615 449 735 449 1035 0 654 -580 1162 -1174 1031z m-7076
-2972 c82 -23 151 -112 433 -564 83 -132 195 -310 251 -396 55 -86 177 -278
270 -425 93 -148 242 -381 330 -519 985 -1534 1042 -1633 1029 -1759 -11 -107
-39 -157 -407 -726 -374 -579 -439 -680 -470 -730 -19 -30 -102 -161 -186
-290 -246 -382 -753 -1173 -859 -1340 -399 -629 -420 -636 -737 -235 -30 39
-396 524 -812 1079 -417 556 -820 1091 -897 1190 -76 100 -255 337 -398 528
-441 591 -451 503 137 1285 180 239 362 483 405 542 43 58 183 245 310 414
128 170 292 391 365 490 804 1093 1072 1435 1146 1456 42 12 45 12 90 0z" fill="url(#tg_logo)"/></g></g></g>
<text x="650" y="707" text-anchor="middle" font-size="42" font-weight="700" letter-spacing="3" fill="#243858">TAIGA</text>
<text x="650" y="735" text-anchor="middle" font-size="15.5" font-weight="600" letter-spacing="2.6" fill="#3f7fe6">CORE PLATFORM</text>
<g transform="translate(648.0,120.0) scale(1.0)" fill="none" stroke="#2f74d6" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="-21" y="-17" width="42" height="29" rx="4"/><line x1="0" y1="12" x2="0" y2="18"/><line x1="-9" y1="18" x2="9" y2="18"/><circle cx="-9" cy="-3" r="5.4"/><line x1="-9" y1="-3" x2="-9" y2="-6.5"/><line x1="-9" y1="-3" x2="-6.3" y2="-1.5"/><polyline points="1,2 6,-4 10,0 15,-6"/></g>
<text x="684.0" y="114.0" text-anchor="start" font-size="16.5" font-weight="700" fill="#e3e8f2" letter-spacing="0.3">DEALERS &amp; TRADERS</text>
<text x="684.0" y="140.0" text-anchor="start" font-size="13" font-weight="400" fill="#aeb7c6">Frontline access to</text>
<text x="684.0" y="158.0" text-anchor="start" font-size="13" font-weight="400" fill="#aeb7c6">tools, alerts and</text>
<text x="684.0" y="176.0" text-anchor="start" font-size="13" font-weight="400" fill="#aeb7c6">workflows.</text>
<g transform="translate(1028.3,274.7) scale(1.0)" fill="none" stroke="#2f74d6" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="0" cy="-9" r="5.6"/><path d="M -9 10 Q -9 0 0 0 Q 9 0 9 10"/><circle cx="-15" cy="-5" r="4.4"/><path d="M -22 9 Q -22 1 -15 1"/><circle cx="15" cy="-5" r="4.4"/><path d="M 22 9 Q 22 1 15 1"/></g>
<text x="1028.3" y="310.7" text-anchor="middle" font-size="16.5" font-weight="700" fill="#e3e8f2" letter-spacing="0.3">EXECUTIVES</text>
<text x="1028.3" y="336.7" text-anchor="middle" font-size="13" font-weight="400" fill="#aeb7c6">Cockpit, KPIs,</text>
<text x="1028.3" y="354.7" text-anchor="middle" font-size="13" font-weight="400" fill="#aeb7c6">dashboards and</text>
<text x="1028.3" y="372.7" text-anchor="middle" font-size="13" font-weight="400" fill="#aeb7c6">strategic insights.</text>
<g transform="translate(1185.0,653.0) scale(1.0)" fill="none" stroke="#2f74d6" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M 0 -19 L 15 -12 L 15 2 Q 15 15 0 21 Q -15 15 -15 2 L -15 -12 Z"/><polyline points="-6.5,-1 -1,5 8,-7"/></g>
<text x="1185.0" y="689.0" text-anchor="middle" font-size="16.5" font-weight="700" fill="#e3e8f2" letter-spacing="0.3">COMPLIANCE</text>
<text x="1185.0" y="715.0" text-anchor="middle" font-size="13" font-weight="400" fill="#aeb7c6">Surveillance,</text>
<text x="1185.0" y="733.0" text-anchor="middle" font-size="13" font-weight="400" fill="#aeb7c6">reporting and</text>
<text x="1185.0" y="751.0" text-anchor="middle" font-size="13" font-weight="400" fill="#aeb7c6">regulatory oversight.</text>
<g transform="translate(998.3,1001.3) scale(1.0)" fill="none" stroke="#2f74d6" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="0" cy="-13" rx="15" ry="5.4"/><path d="M -15 -13 L -15 13 Q -15 18.4 0 18.4 Q 15 18.4 15 13 L 15 -13"/><path d="M -15 0 Q -15 5.4 0 5.4 Q 15 5.4 15 0"/></g>
<text x="998.3" y="1037.3" text-anchor="middle" font-size="16.5" font-weight="700" fill="#e3e8f2" letter-spacing="0.3">CRM / BACK OFFICE</text>
<text x="998.3" y="1057.3" text-anchor="middle" font-size="16.5" font-weight="700" fill="#e3e8f2" letter-spacing="0.3">SYSTEMS</text>
<text x="998.3" y="1083.3" text-anchor="middle" font-size="13" font-weight="400" fill="#aeb7c6">Client, account and</text>
<text x="998.3" y="1101.3" text-anchor="middle" font-size="13" font-weight="400" fill="#aeb7c6">reference data</text>
<text x="998.3" y="1119.3" text-anchor="middle" font-size="13" font-weight="400" fill="#aeb7c6">synchronization.</text>
<g transform="translate(648.0,1190.0) scale(1.0)" fill="none" stroke="#2f74d6" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M -13 9 Q -22 9 -22 0.5 Q -22 -7.5 -13.5 -7 Q -11.5 -17 -1 -15 Q 6.5 -18 11 -10.5 Q 21 -11 21 -1 Q 21 9 12 9 Z"/></g>
<text x="684.0" y="1164.0" text-anchor="start" font-size="16.5" font-weight="700" fill="#e3e8f2" letter-spacing="0.3">THIRD-PARTY</text>
<text x="684.0" y="1184.0" text-anchor="start" font-size="16.5" font-weight="700" fill="#e3e8f2" letter-spacing="0.3">APPLICATIONS</text>
<text x="684.0" y="1210.0" text-anchor="start" font-size="13" font-weight="400" fill="#aeb7c6">APIs and webhooks</text>
<text x="684.0" y="1228.0" text-anchor="start" font-size="13" font-weight="400" fill="#aeb7c6">for extensibility.</text>
<g transform="translate(301.7,1001.3) scale(1.0)" fill="none" stroke="#2f74d6" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="0" cy="0" r="18"/><ellipse cx="0" cy="0" rx="7.4" ry="18"/><line x1="-18" y1="0" x2="18" y2="0"/><path d="M -16.4 -8 Q 0 -3 16.4 -8"/><path d="M -16.4 8 Q 0 3 16.4 8"/></g>
<text x="301.7" y="1037.3" text-anchor="middle" font-size="16.5" font-weight="700" fill="#e3e8f2" letter-spacing="0.3">MARKET DATA</text>
<text x="301.7" y="1057.3" text-anchor="middle" font-size="16.5" font-weight="700" fill="#e3e8f2" letter-spacing="0.3">PROVIDERS</text>
<text x="301.7" y="1083.3" text-anchor="middle" font-size="13" font-weight="400" fill="#aeb7c6">Prices, indices,</text>
<text x="301.7" y="1101.3" text-anchor="middle" font-size="13" font-weight="400" fill="#aeb7c6">economic events</text>
<text x="301.7" y="1119.3" text-anchor="middle" font-size="13" font-weight="400" fill="#aeb7c6">and reference data.</text>
<g transform="translate(115.0,653.0) scale(1.0)" fill="none" stroke="#2f74d6" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M 0 -15 L 19 -6 L 0 3 L -19 -6 Z"/><polyline points="-19,0 0,9 19,0"/><polyline points="-19,6 0,15 19,6"/></g>
<text x="115.0" y="689.0" text-anchor="middle" font-size="16.5" font-weight="700" fill="#e3e8f2" letter-spacing="0.3">LIQUIDITY</text>
<text x="115.0" y="709.0" text-anchor="middle" font-size="16.5" font-weight="700" fill="#e3e8f2" letter-spacing="0.3">PROVIDERS</text>
<text x="115.0" y="735.0" text-anchor="middle" font-size="13" font-weight="400" fill="#aeb7c6">Prices, liquidity,</text>
<text x="115.0" y="753.0" text-anchor="middle" font-size="13" font-weight="400" fill="#aeb7c6">quotes and</text>
<text x="115.0" y="771.0" text-anchor="middle" font-size="13" font-weight="400" fill="#aeb7c6">executions.</text>
<g transform="translate(271.7,274.7) scale(1.0)" fill="none" stroke="#2f74d6" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="-19" y="-17" width="38" height="11" rx="2.5"/><rect x="-19" y="-3.5" width="38" height="11" rx="2.5"/><rect x="-19" y="10" width="38" height="11" rx="2.5"/><circle cx="-13" cy="-11.5" r="1.3" fill="#2f74d6" stroke="none"/><circle cx="-8" cy="-11.5" r="1.3" fill="#2f74d6" stroke="none"/><line x1="9" y1="-11.5" x2="14" y2="-11.5"/><circle cx="-13" cy="2" r="1.3" fill="#2f74d6" stroke="none"/><circle cx="-8" cy="2" r="1.3" fill="#2f74d6" stroke="none"/><line x1="9" y1="2" x2="14" y2="2"/><circle cx="-13" cy="15.5" r="1.3" fill="#2f74d6" stroke="none"/><circle cx="-8" cy="15.5" r="1.3" fill="#2f74d6" stroke="none"/><line x1="9" y1="15.5" x2="14" y2="15.5"/></g>
<text x="271.7" y="310.7" text-anchor="middle" font-size="16.5" font-weight="700" fill="#e3e8f2" letter-spacing="0.3">MT5 / MT4</text>
<text x="271.7" y="330.7" text-anchor="middle" font-size="16.5" font-weight="700" fill="#e3e8f2" letter-spacing="0.3">SERVERS</text>
<text x="271.7" y="356.7" text-anchor="middle" font-size="13" font-weight="400" fill="#aeb7c6">Trade flow, orders,</text>
<text x="271.7" y="374.7" text-anchor="middle" font-size="13" font-weight="400" fill="#aeb7c6">positions and</text>
<text x="271.7" y="392.7" text-anchor="middle" font-size="13" font-weight="400" fill="#aeb7c6">account data.</text>
</svg>`;
