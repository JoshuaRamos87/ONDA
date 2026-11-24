/**
 * ONDA — Pure Geographic, Distance & Astronomical Solar Time Math
 * Extracted from js/map.js so country centroids, Haversine distance,
 * coordinate validation, and solar day/night terminator math stay cleanly isolated.
 */

export const WIDE_MULTI_TZ_COUNTRIES = new Set([
  'US', 'CA', 'RU', 'BR', 'AU', 'MX', 'ID', 'KZ', 'MN', 'CD', 'GL', 'KI', 'PF', 'FM', 'AQ',
]);

// Compact ISO 3166-1 alpha-2 country/territory centroids [lat, lng] for Country Hub fallback
export const COUNTRY_CENTROIDS = {
  AD: [42.55, 1.6], AE: [23.42, 53.85], AF: [33.94, 67.71], AG: [17.06, -61.8],
  AI: [18.22, -63.07], AL: [41.15, 20.17], AM: [40.07, 45.04], AO: [-11.2, 17.87],
  AQ: [-75.25, -0.07], AR: [-38.42, -63.62], AS: [-14.27, -170.13], AT: [47.52, 14.55],
  AU: [-25.27, 133.78], AW: [12.52, -69.97], AX: [60.18, 19.92], AZ: [40.14, 47.58],
  BA: [43.92, 17.68], BB: [13.19, -59.54], BD: [23.68, 90.36], BE: [50.5, 4.47],
  BF: [12.24, -1.56], BG: [42.73, 25.49], BH: [25.93, 50.64], BI: [-3.37, 29.92],
  BJ: [9.31, 2.32], BL: [17.9, -62.83], BM: [32.32, -64.76], BN: [4.54, 114.73],
  BO: [-16.29, -63.59], BQ: [12.18, -68.24], BR: [-14.24, -51.93], BS: [25.03, -77.4],
  BT: [27.51, 90.43], BW: [-22.33, 24.68], BY: [53.71, 27.95], BZ: [17.19, -88.5],
  CA: [56.13, -106.35], CC: [-12.16, 96.87], CD: [-4.04, 21.76], CF: [6.61, 20.94],
  CG: [-0.23, 15.83], CH: [46.82, 8.23], CI: [7.54, -5.55], CK: [-21.24, -159.78],
  CL: [-35.68, -71.54], CM: [7.37, 12.35], CN: [35.86, 104.2], CO: [4.57, -74.3],
  CR: [9.75, -83.75], CU: [21.52, -77.78], CV: [16.0, -24.01], CW: [12.17, -68.99],
  CX: [-10.45, 105.69], CY: [35.13, 33.43], CZ: [49.82, 15.47], DE: [51.17, 10.45],
  DJ: [11.83, 42.59], DK: [56.26, 9.5], DM: [15.41, -61.37], DO: [18.74, -70.16],
  DZ: [28.03, 1.66], EC: [-1.83, -78.18], EE: [58.6, 25.01], EG: [26.82, 30.8],
  EH: [24.22, -12.89], ER: [15.18, 39.78], ES: [40.46, -3.75], ET: [9.15, 40.49],
  FI: [61.92, 25.75], FJ: [-17.71, 178.07], FK: [-51.8, -59.52], FM: [7.43, 150.55],
  FO: [61.89, -6.91], FR: [46.23, 2.21], GA: [-0.8, 11.61], GB: [55.38, -3.44],
  GD: [12.26, -61.6], GE: [42.32, 43.36], GF: [3.93, -53.13], GG: [49.47, -2.59],
  GH: [7.95, -1.02], GI: [36.14, -5.35], GL: [71.71, -42.6], GM: [13.44, -15.31],
  GN: [9.95, -9.7], GP: [16.99, -62.07], GQ: [1.65, 10.27], GR: [39.07, 21.82],
  GS: [-54.43, -36.59], GT: [15.78, -90.23], GU: [13.44, 144.79], GW: [11.8, -15.18],
  GY: [4.86, -58.93], HK: [22.4, 114.11], HN: [15.2, -86.24], HR: [45.1, 15.2],
  HT: [18.97, -72.29], HU: [47.16, 19.5], ID: [-0.79, 113.92], IE: [53.41, -8.24],
  IL: [31.05, 34.85], IM: [54.24, -4.55], IN: [20.59, 78.96], IO: [-6.34, 71.88],
  IQ: [33.22, 43.68], IR: [32.43, 53.69], IS: [64.96, -19.02], IT: [41.87, 12.57],
  JE: [49.21, -2.13], JM: [18.11, -77.3], JO: [30.59, 36.24], JP: [36.2, 138.25],
  KE: [-0.02, 37.91], KG: [41.2, 74.77], KH: [12.57, 104.99], KI: [-3.37, -168.73],
  KM: [-11.88, 43.87], KN: [17.36, -62.78], KP: [40.34, 127.51], KR: [35.91, 127.77],
  KW: [29.31, 47.48], KY: [19.51, -80.57], KZ: [48.02, 66.92], LA: [19.86, 102.5],
  LB: [33.85, 35.86], LC: [13.91, -60.98], LI: [47.17, 9.56], LK: [7.87, 80.77],
  LR: [6.43, -9.43], LS: [-29.61, 28.23], LT: [55.17, 23.88], LU: [49.82, 6.13],
  LV: [56.88, 24.6], LY: [26.34, 17.23], MA: [31.79, -7.09], MC: [43.75, 7.41],
  MD: [47.41, 28.37], ME: [42.71, 19.37], MF: [18.08, -63.05], MG: [-18.77, 46.87],
  MH: [7.13, 171.18], MK: [41.61, 21.75], ML: [17.57, -4.0], MM: [21.91, 95.96],
  MN: [46.86, 103.85], MO: [22.2, 113.54], MP: [17.33, 145.38], MQ: [14.64, -61.02],
  MR: [21.01, -10.94], MS: [16.74, -62.19], MT: [35.94, 14.38], MU: [-20.35, 57.55],
  MV: [3.2, 73.22], MW: [-13.25, 34.3], MX: [23.63, -102.55], MY: [4.21, 101.98],
  MZ: [-18.67, 35.53], NA: [-22.96, 18.49], NC: [-20.9, 165.62], NE: [17.61, 8.08],
  NF: [-29.04, 167.95], NG: [9.08, 8.68], NI: [12.87, -85.21], NL: [52.13, 5.29],
  NO: [60.47, 8.47], NP: [28.39, 84.12], NR: [-0.52, 166.93], NU: [-19.05, -169.87],
  NZ: [-40.9, 174.89], OM: [21.51, 55.92], PA: [8.54, -80.78], PE: [-9.19, -75.02],
  PF: [-17.68, -149.41], PG: [-6.31, 143.96], PH: [12.88, 121.77], PK: [30.38, 69.35],
  PL: [51.92, 19.15], PM: [46.94, -56.27], PN: [-24.7, -127.44], PR: [18.22, -66.59],
  PS: [31.95, 35.23], PT: [39.4, -8.22], PW: [7.51, 134.58], PY: [-23.44, -58.44],
  QA: [25.35, 51.18], RE: [-21.12, 55.54], RO: [45.94, 24.97], RS: [44.02, 21.01],
  RU: [61.52, 105.32], RW: [-1.94, 29.87], SA: [23.89, 45.08], SB: [-9.65, 160.16],
  SC: [-4.68, 55.49], SD: [12.86, 30.22], SE: [60.13, 18.64], SG: [1.35, 103.82],
  SH: [-15.96, -5.7], SI: [46.15, 14.99], SJ: [77.55, 23.67], SK: [48.67, 19.7],
  SL: [8.46, -11.78], SM: [43.94, 12.46], SN: [14.5, -14.45], SO: [5.15, 46.2],
  SR: [3.92, -56.03], SS: [6.88, 31.31], ST: [0.19, 6.61], SV: [13.79, -88.9],
  SX: [18.04, -63.05], SY: [34.8, 39.0], SZ: [-26.52, 31.47], TC: [21.69, -71.8],
  TD: [15.45, 18.73], TF: [-49.28, 69.35], TG: [8.62, 0.82], TH: [15.87, 100.99],
  TJ: [38.86, 71.28], TK: [-8.97, -171.86], TL: [-8.87, 125.73], TM: [38.97, 59.56],
  TN: [33.89, 9.54], TO: [-21.18, -175.2], TR: [38.96, 35.24], TT: [10.69, -61.22],
  TV: [-7.11, 177.65], TW: [23.7, 120.96], TZ: [-6.37, 34.89], UA: [48.38, 31.17],
  UG: [1.37, 32.29], US: [39.83, -98.58], UY: [-32.52, -55.77], UZ: [41.38, 64.59],
  VA: [41.9, 12.45], VC: [12.98, -61.29], VE: [6.42, -66.59], VG: [18.42, -64.64],
  VI: [18.34, -64.9], VN: [14.06, 108.28], VU: [-15.38, 166.96], WF: [-13.77, -177.16],
  WS: [-13.76, -172.1], XK: [42.6, 20.9], YE: [15.55, 48.52], YT: [-12.83, 45.17],
  ZA: [-30.56, 22.94], ZM: [-13.13, 27.85], ZW: [-19.02, 29.15],
};

export const TIME_BAND_META = {
  morning: { label: 'Morning', icon: '🌅', targetHour: 8.5 },
  afternoon: { label: 'Afternoon', icon: '☀️', targetHour: 14 },
  evening: { label: 'Evening', icon: '🌇', targetHour: 19 },
  night: { label: 'Late Night', icon: '🌙', targetHour: 0.5 },
};

/**
 * Country-scoped city & region fallback coordinates:
 * ISO alpha-2 country -> normalized location key -> [lat, lng, displayLabel]
 * Scoped by country so shared place names never collide across borders.
 */
export const CITY_REGION_COORDS = {
  JP: {
    tokyo: [35.6762, 139.6503, 'Tokyo'],
    '東京': [35.6762, 139.6503, 'Tokyo'],
    shibuya: [35.6595, 139.7004, 'Tokyo'],
    shinjuku: [35.6938, 139.7034, 'Tokyo'],
    osaka: [34.6937, 135.5023, 'Osaka'],
    '大阪': [34.6937, 135.5023, 'Osaka'],
    kyoto: [35.0116, 135.7681, 'Kyoto'],
    '京都': [35.0116, 135.7681, 'Kyoto'],
    kobe: [34.6901, 135.1955, 'Kobe'],
    '神戸': [34.6901, 135.1955, 'Kobe'],
    hyogo: [34.6913, 135.183, 'Hyogo'],
    yokohama: [35.4437, 139.638, 'Yokohama'],
    '横浜': [35.4437, 139.638, 'Yokohama'],
    kanagawa: [35.4478, 139.6425, 'Kanagawa'],
    kawasaki: [35.5308, 139.703, 'Kawasaki'],
    nagoya: [35.1815, 136.9066, 'Nagoya'],
    '名古屋': [35.1815, 136.9066, 'Nagoya'],
    aichi: [35.1802, 136.9066, 'Aichi'],
    sapporo: [43.0618, 141.3545, 'Sapporo'],
    '札幌': [43.0618, 141.3545, 'Sapporo'],
    hokkaido: [43.0642, 141.3469, 'Hokkaido'],
    hokaido: [43.0642, 141.3469, 'Hokkaido'],
    '北海道': [43.0642, 141.3469, 'Hokkaido'],
    fukuoka: [33.5902, 130.4017, 'Fukuoka'],
    '福岡': [33.5902, 130.4017, 'Fukuoka'],
    kitakyushu: [33.8834, 130.8751, 'Kitakyushu'],
    sendai: [38.2682, 140.8694, 'Sendai'],
    '仙台': [38.2682, 140.8694, 'Sendai'],
    miyagi: [38.2688, 140.8721, 'Miyagi'],
    hiroshima: [34.3853, 132.4553, 'Hiroshima'],
    '広島': [34.3853, 132.4553, 'Hiroshima'],
    okinawa: [26.2124, 127.6809, 'Okinawa'],
    '沖縄': [26.2124, 127.6809, 'Okinawa'],
    naha: [26.2124, 127.6792, 'Naha'],
    shiga: [35.0045, 135.8686, 'Shiga'],
    '滋賀': [35.0045, 135.8686, 'Shiga'],
    otsu: [35.0179, 135.8546, 'Otsu'],
    chiba: [35.6074, 140.1065, 'Chiba'],
    saitama: [35.8617, 139.6455, 'Saitama'],
    niigata: [37.9162, 139.0364, 'Niigata'],
    shizuoka: [34.9756, 138.3828, 'Shizuoka'],
    hamamatsu: [34.7108, 137.7261, 'Hamamatsu'],
    nagano: [36.6486, 138.1942, 'Nagano'],
    kumamoto: [32.8031, 130.7079, 'Kumamoto'],
    kagoshima: [31.5966, 130.5571, 'Kagoshima'],
    okayama: [34.6551, 133.9195, 'Okayama'],
    kanazawa: [36.5613, 136.6562, 'Kanazawa'],
    ishikawa: [36.5947, 136.6256, 'Ishikawa'],
    fukushima: [37.7608, 140.4747, 'Fukushima'],
    tochigi: [36.5657, 139.8836, 'Tochigi'],
    gunma: [36.3911, 139.0608, 'Gunma'],
    ibaraki: [36.3418, 140.4468, 'Ibaraki'],
    gifu: [35.4233, 136.7607, 'Gifu'],
    mie: [34.7303, 136.5086, 'Mie'],
    nara: [34.6851, 135.8048, 'Nara'],
    wakayama: [34.226, 135.1675, 'Wakayama'],
    matsuyama: [33.8392, 132.7657, 'Matsuyama'],
    ehime: [33.8416, 132.7657, 'Ehime'],
    takamatsu: [34.3428, 134.0466, 'Takamatsu'],
    kagawa: [34.3401, 134.0434, 'Kagawa'],
    kochi: [33.5597, 133.5311, 'Kochi'],
    tokushima: [34.0703, 134.5548, 'Tokushima'],
    nagasaki: [32.7503, 129.8777, 'Nagasaki'],
    oita: [33.2382, 131.6126, 'Oita'],
    miyazaki: [31.9111, 131.4239, 'Miyazaki'],
    saga: [33.2494, 130.2988, 'Saga'],
    yamaguchi: [34.1859, 131.4706, 'Yamaguchi'],
    tottori: [35.5011, 134.2351, 'Tottori'],
    shimane: [35.4723, 133.0505, 'Shimane'],
    toyama: [36.6953, 137.2113, 'Toyama'],
    fukui: [36.0652, 136.2216, 'Fukui'],
    yamanashi: [35.6642, 138.5684, 'Yamanashi'],
    akita: [39.7186, 140.1024, 'Akita'],
    aomori: [40.8221, 140.7474, 'Aomori'],
    iwate: [39.7036, 141.1527, 'Iwate'],
    yamagata: [38.2404, 140.3633, 'Yamagata'],
    kanto: [35.6762, 139.6503, 'Kanto'],
    kansai: [34.6937, 135.5023, 'Kansai'],
  },
  KR: {
    seoul: [37.5665, 126.978, 'Seoul'],
    '서울': [37.5665, 126.978, 'Seoul'],
    busan: [35.1796, 129.0756, 'Busan'],
    pusan: [35.1796, 129.0756, 'Busan'],
    '부산': [35.1796, 129.0756, 'Busan'],
    incheon: [37.4563, 126.7052, 'Incheon'],
    '인천': [37.4563, 126.7052, 'Incheon'],
    daegu: [35.8714, 128.6014, 'Daegu'],
    '대구': [35.8714, 128.6014, 'Daegu'],
    daejeon: [36.3504, 127.3845, 'Daejeon'],
    '대전': [36.3504, 127.3845, 'Daejeon'],
    gwangju: [35.1595, 126.8526, 'Gwangju'],
    '광주': [35.1595, 126.8526, 'Gwangju'],
    suwon: [37.2636, 127.0286, 'Suwon'],
    ulsan: [35.5384, 129.3114, 'Ulsan'],
    jeju: [33.4996, 126.5312, 'Jeju'],
    '제주': [33.4996, 126.5312, 'Jeju'],
    changwon: [35.228, 128.6811, 'Changwon'],
    cheongju: [36.6424, 127.489, 'Cheongju'],
    jeonju: [35.8242, 127.148, 'Jeonju'],
    chuncheon: [37.8813, 127.7298, 'Chuncheon'],
    gangwon: [37.8228, 128.1555, 'Gangwon'],
    gyeonggi: [37.4138, 127.5183, 'Gyeonggi'],
  },
  BR: {
    'sao paulo': [-23.5505, -46.6333, 'São Paulo'],
    'rio de janeiro': [-22.9068, -43.1729, 'Rio de Janeiro'],
    brasilia: [-15.7975, -47.8919, 'Brasília'],
    'distrito federal': [-15.7975, -47.8919, 'Brasília'],
    salvador: [-12.9714, -38.5014, 'Salvador'],
    fortaleza: [-3.7172, -38.5433, 'Fortaleza'],
    'belo horizonte': [-19.9167, -43.9345, 'Belo Horizonte'],
    manaus: [-3.119, -60.0217, 'Manaus'],
    curitiba: [-25.4284, -49.2733, 'Curitiba'],
    recife: [-8.0476, -34.877, 'Recife'],
    'porto alegre': [-30.0346, -51.2177, 'Porto Alegre'],
    belem: [-1.4558, -48.4902, 'Belém'],
    goiania: [-16.6869, -49.2648, 'Goiânia'],
    campinas: [-22.9099, -47.0626, 'Campinas'],
    florianopolis: [-27.5954, -48.548, 'Florianópolis'],
    vitoria: [-20.3155, -40.3128, 'Vitória'],
    natal: [-5.7945, -35.211, 'Natal'],
    'joao pessoa': [-7.1195, -34.845, 'João Pessoa'],
    maceio: [-9.6658, -35.7353, 'Maceió'],
    teresina: [-5.092, -42.8038, 'Teresina'],
    'sao luis': [-2.5307, -44.3068, 'São Luís'],
    'campo grande': [-20.4697, -54.6201, 'Campo Grande'],
    cuiaba: [-15.6014, -56.0979, 'Cuiabá'],
    aracaju: [-10.9472, -37.0731, 'Aracaju'],
    'ribeirao preto': [-21.1775, -47.8103, 'Ribeirão Preto'],
    santos: [-23.9608, -46.3336, 'Santos'],
    londrina: [-23.3045, -51.1696, 'Londrina'],
    joinville: [-26.3045, -48.8487, 'Joinville'],
    uberlandia: [-18.9186, -48.2772, 'Uberlândia'],
    'minas gerais': [-19.9167, -43.9345, 'Minas Gerais'],
    bahia: [-12.9714, -38.5014, 'Bahia'],
    parana: [-25.4284, -49.2733, 'Paraná'],
    pernambuco: [-8.0476, -34.877, 'Pernambuco'],
    ceara: [-3.7172, -38.5433, 'Ceará'],
    'santa catarina': [-27.5954, -48.548, 'Santa Catarina'],
    'rio grande do sul': [-30.0346, -51.2177, 'Rio Grande do Sul'],
    para: [-1.4558, -48.4902, 'Pará'],
    amazonas: [-3.119, -60.0217, 'Amazonas'],
    goias: [-16.6869, -49.2648, 'Goiás'],
  },
  IN: {
    mumbai: [19.076, 72.8777, 'Mumbai'],
    bombay: [19.076, 72.8777, 'Mumbai'],
    'new delhi': [28.6139, 77.209, 'New Delhi'],
    delhi: [28.7041, 77.1025, 'Delhi'],
    bengaluru: [12.9716, 77.5946, 'Bengaluru'],
    bangalore: [12.9716, 77.5946, 'Bengaluru'],
    hyderabad: [17.385, 78.4867, 'Hyderabad'],
    chennai: [13.0827, 80.2707, 'Chennai'],
    madras: [13.0827, 80.2707, 'Chennai'],
    kolkata: [22.5726, 88.3639, 'Kolkata'],
    calcutta: [22.5726, 88.3639, 'Kolkata'],
    pune: [18.5204, 73.8567, 'Pune'],
    ahmedabad: [23.0225, 72.5714, 'Ahmedabad'],
    jaipur: [26.9124, 75.7873, 'Jaipur'],
    surat: [21.1702, 72.8311, 'Surat'],
    lucknow: [26.8467, 80.9462, 'Lucknow'],
    kochi: [9.9312, 76.2673, 'Kochi'],
    cochin: [9.9312, 76.2673, 'Kochi'],
    thiruvananthapuram: [8.5241, 76.9366, 'Thiruvananthapuram'],
    trivandrum: [8.5241, 76.9366, 'Thiruvananthapuram'],
    coimbatore: [11.0168, 76.9558, 'Coimbatore'],
    madurai: [9.9252, 78.1198, 'Madurai'],
    chandigarh: [30.7333, 76.7794, 'Chandigarh'],
    indore: [22.7196, 75.8577, 'Indore'],
    bhopal: [23.2599, 77.4126, 'Bhopal'],
    nagpur: [21.1458, 79.0882, 'Nagpur'],
    visakhapatnam: [17.6868, 83.2185, 'Visakhapatnam'],
    patna: [25.5941, 85.1376, 'Patna'],
    bhubaneswar: [20.2961, 85.8245, 'Bhubaneswar'],
    guwahati: [26.1445, 91.7362, 'Guwahati'],
    amritsar: [31.634, 74.8723, 'Amritsar'],
    ludhiana: [30.901, 75.8573, 'Ludhiana'],
    vadodara: [22.3072, 73.1812, 'Vadodara'],
    mysuru: [12.2958, 76.6394, 'Mysuru'],
    mysore: [12.2958, 76.6394, 'Mysuru'],
    mangalore: [12.9141, 74.856, 'Mangaluru'],
    goa: [15.4909, 73.8278, 'Goa'],
    panaji: [15.4909, 73.8278, 'Goa'],
    kerala: [10.8505, 76.2711, 'Kerala'],
    'tamil nadu': [11.1271, 78.6569, 'Tamil Nadu'],
    maharashtra: [19.7515, 75.7139, 'Maharashtra'],
    karnataka: [15.3173, 75.7139, 'Karnataka'],
    gujarat: [22.2587, 71.1924, 'Gujarat'],
    punjab: [31.1471, 75.3412, 'Punjab'],
    rajasthan: [27.0238, 74.2179, 'Rajasthan'],
    'west bengal': [22.9868, 87.855, 'West Bengal'],
    'andhra pradesh': [15.9129, 79.74, 'Andhra Pradesh'],
    telangana: [18.1124, 79.0193, 'Telangana'],
  },
  ID: {
    jakarta: [-6.2088, 106.8456, 'Jakarta'],
    surabaya: [-7.2575, 112.7521, 'Surabaya'],
    bandung: [-6.9175, 107.6191, 'Bandung'],
    medan: [3.5952, 98.6722, 'Medan'],
    semarang: [-6.9667, 110.4167, 'Semarang'],
    makassar: [-5.1477, 119.4327, 'Makassar'],
    palembang: [-2.9761, 104.7754, 'Palembang'],
    depok: [-6.4025, 106.7942, 'Depok'],
    tangerang: [-6.1783, 106.6319, 'Tangerang'],
    bekasi: [-6.2383, 106.9756, 'Bekasi'],
    yogyakarta: [-7.7956, 110.3695, 'Yogyakarta'],
    jogja: [-7.7956, 110.3695, 'Yogyakarta'],
    denpasar: [-8.6705, 115.2126, 'Denpasar'],
    bali: [-8.4095, 115.1889, 'Bali'],
    malang: [-7.9666, 112.6326, 'Malang'],
    balikpapan: [-1.2379, 116.8529, 'Balikpapan'],
    banjarmasin: [-3.3186, 114.5944, 'Banjarmasin'],
    pontianak: [-0.0263, 109.3425, 'Pontianak'],
    manado: [1.4748, 124.8421, 'Manado'],
    padang: [-0.9471, 100.4172, 'Padang'],
    pekanbaru: [0.5071, 101.4478, 'Pekanbaru'],
    'bandar lampung': [-5.4292, 105.261, 'Bandar Lampung'],
    batam: [1.0456, 104.0305, 'Batam'],
    aceh: [5.5483, 95.3238, 'Aceh'],
    'banda aceh': [5.5483, 95.3238, 'Banda Aceh'],
    lombok: [-8.5833, 116.1167, 'Lombok'],
    mataram: [-8.5833, 116.1167, 'Mataram'],
    surakarta: [-7.5755, 110.8243, 'Surakarta'],
    solo: [-7.5755, 110.8243, 'Surakarta'],
    jayapura: [-2.5916, 140.669, 'Jayapura'],
    ambon: [-3.6954, 128.1814, 'Ambon'],
    'jawa barat': [-6.9175, 107.6191, 'West Java'],
    'jawa timur': [-7.2575, 112.7521, 'East Java'],
    'jawa tengah': [-6.9667, 110.4167, 'Central Java'],
  },
  MX: {
    'ciudad de mexico': [19.4326, -99.1332, 'Mexico City'],
    'mexico city': [19.4326, -99.1332, 'Mexico City'],
    cdmx: [19.4326, -99.1332, 'Mexico City'],
    'distrito federal': [19.4326, -99.1332, 'Mexico City'],
    guadalajara: [20.6597, -103.3496, 'Guadalajara'],
    monterrey: [25.6866, -100.3161, 'Monterrey'],
    puebla: [19.0414, -98.2063, 'Puebla'],
    tijuana: [32.5149, -117.0382, 'Tijuana'],
    leon: [21.125, -101.686, 'León'],
    'ciudad juarez': [31.6904, -106.4245, 'Ciudad Juárez'],
    juarez: [31.6904, -106.4245, 'Ciudad Juárez'],
    merida: [20.9674, -89.5926, 'Mérida'],
    cancun: [21.1619, -86.8515, 'Cancún'],
    queretaro: [20.5888, -100.3899, 'Querétaro'],
    'san luis potosi': [22.1565, -100.9855, 'San Luis Potosí'],
    aguascalientes: [21.8853, -102.2916, 'Aguascalientes'],
    toluca: [19.2826, -99.6557, 'Toluca'],
    chihuahua: [28.633, -106.0691, 'Chihuahua'],
    saltillo: [25.4232, -101.0053, 'Saltillo'],
    hermosillo: [29.0729, -110.9559, 'Hermosillo'],
    culiacan: [24.8091, -107.394, 'Culiacán'],
    mexicali: [32.6245, -115.4523, 'Mexicali'],
    veracruz: [19.1738, -96.1342, 'Veracruz'],
    acapulco: [16.8531, -99.8237, 'Acapulco'],
    oaxaca: [17.0732, -96.7266, 'Oaxaca'],
    morelia: [19.706, -101.195, 'Morelia'],
    villahermosa: [17.9895, -92.9475, 'Villahermosa'],
    'tuxtla gutierrez': [16.7528, -93.1167, 'Tuxtla Gutiérrez'],
    tampico: [22.2331, -97.8611, 'Tampico'],
    torreon: [25.5428, -103.4068, 'Torreón'],
    durango: [24.0277, -104.6532, 'Durango'],
    mazatlan: [23.2494, -106.4111, 'Mazatlán'],
    ensenada: [31.8667, -116.5964, 'Ensenada'],
    jalisco: [20.6597, -103.3496, 'Jalisco'],
    'nuevo leon': [25.6866, -100.3161, 'Nuevo León'],
    yucatan: [20.9674, -89.5926, 'Yucatán'],
    sonora: [29.0729, -110.9559, 'Sonora'],
    sinaloa: [24.8091, -107.394, 'Sinaloa'],
    chiapas: [16.7528, -93.1167, 'Chiapas'],
    guanajuato: [21.019, -101.2574, 'Guanajuato'],
    michoacan: [19.706, -101.195, 'Michoacán'],
    'baja california': [32.5149, -117.0382, 'Baja California'],
  },
  PH: {
    'metro manila': [14.5995, 120.9842, 'Metro Manila'],
    manila: [14.5995, 120.9842, 'Manila'],
    'quezon city': [14.676, 121.0437, 'Quezon City'],
    makati: [14.5547, 121.0244, 'Makati'],
    pasig: [14.5764, 121.0851, 'Pasig'],
    taguig: [14.5176, 121.0509, 'Taguig'],
    cebu: [10.3157, 123.8854, 'Cebu'],
    davao: [7.1907, 125.4553, 'Davao'],
    iloilo: [10.7202, 122.5621, 'Iloilo'],
    bacolod: [10.6765, 122.9509, 'Bacolod'],
    'cagayan de oro': [8.4542, 124.6319, 'Cagayan de Oro'],
    zamboanga: [6.9214, 122.079, 'Zamboanga'],
    baguio: [16.4023, 120.596, 'Baguio'],
    pampanga: [15.0794, 120.62, 'Pampanga'],
    batangas: [13.7565, 121.0583, 'Batangas'],
    cavite: [14.4791, 120.897, 'Cavite'],
    laguna: [14.2691, 121.4113, 'Laguna'],
    naga: [13.6218, 123.1948, 'Naga'],
    legazpi: [13.1391, 123.7438, 'Legazpi'],
    tacloban: [11.2543, 124.9617, 'Tacloban'],
    'general santos': [6.1164, 125.1716, 'General Santos'],
    dumaguete: [9.3068, 123.3054, 'Dumaguete'],
    palawan: [9.8349, 118.7384, 'Palawan'],
    bohol: [9.85, 124.1435, 'Bohol'],
    dagupan: [16.0433, 120.3333, 'Dagupan'],
  },
  TH: {
    bangkok: [13.7563, 100.5018, 'Bangkok'],
    'krung thep': [13.7563, 100.5018, 'Bangkok'],
    'chiang mai': [18.7883, 98.9853, 'Chiang Mai'],
    'chiang rai': [19.9105, 99.8406, 'Chiang Rai'],
    phuket: [7.8804, 98.3923, 'Phuket'],
    pattaya: [12.9236, 100.8825, 'Pattaya'],
    chonburi: [13.3611, 100.9847, 'Chonburi'],
    'khon kaen': [16.4419, 102.836, 'Khon Kaen'],
    'hat yai': [7.0086, 100.4747, 'Hat Yai'],
    songkhla: [7.1897, 100.5954, 'Songkhla'],
    'udon thani': [17.4156, 102.7872, 'Udon Thani'],
    'nakhon ratchasima': [14.9799, 102.0978, 'Nakhon Ratchasima'],
    korat: [14.9799, 102.0978, 'Nakhon Ratchasima'],
    'hua hin': [12.5684, 99.9577, 'Hua Hin'],
    'surat thani': [9.1382, 99.3217, 'Surat Thani'],
    krabi: [8.0863, 98.9063, 'Krabi'],
    nonthaburi: [13.8621, 100.5144, 'Nonthaburi'],
    'ubon ratchathani': [15.2287, 104.8564, 'Ubon Ratchathani'],
    phitsanulok: [16.8211, 100.2659, 'Phitsanulok'],
  },
  TW: {
    'new taipei': [25.012, 121.4657, 'New Taipei'],
    taipei: [25.033, 121.5654, 'Taipei'],
    '台北': [25.033, 121.5654, 'Taipei'],
    taichung: [24.1477, 120.6736, 'Taichung'],
    '台中': [24.1477, 120.6736, 'Taichung'],
    kaohsiung: [22.6273, 120.3014, 'Kaohsiung'],
    '高雄': [22.6273, 120.3014, 'Kaohsiung'],
    tainan: [22.9999, 120.2269, 'Tainan'],
    taoyuan: [24.9936, 121.301, 'Taoyuan'],
    hsinchu: [24.8138, 120.9675, 'Hsinchu'],
    keelung: [25.1276, 121.7392, 'Keelung'],
    chiayi: [23.4801, 120.4491, 'Chiayi'],
    changhua: [24.0518, 120.5161, 'Changhua'],
    hualien: [23.9872, 121.6016, 'Hualien'],
    taitung: [22.7583, 121.1444, 'Taitung'],
    yilan: [24.757, 121.753, 'Yilan'],
    pingtung: [22.6762, 120.4929, 'Pingtung'],
  },
  AR: {
    'buenos aires': [-34.6037, -58.3816, 'Buenos Aires'],
    caba: [-34.6037, -58.3816, 'Buenos Aires'],
    cordoba: [-31.4201, -64.1888, 'Córdoba'],
    rosario: [-32.9442, -60.6505, 'Rosario'],
    mendoza: [-32.8895, -68.8458, 'Mendoza'],
    'la plata': [-34.9205, -57.9536, 'La Plata'],
    tucuman: [-26.8083, -65.2176, 'Tucumán'],
    'mar del plata': [-38.0055, -57.5426, 'Mar del Plata'],
    salta: [-24.7821, -65.4232, 'Salta'],
    'santa fe': [-31.6107, -60.6973, 'Santa Fe'],
    'san juan': [-31.5375, -68.5364, 'San Juan'],
    resistencia: [-27.4514, -58.9867, 'Resistencia'],
    neuquen: [-38.9516, -68.0591, 'Neuquén'],
    corrientes: [-27.4692, -58.8306, 'Corrientes'],
    posadas: [-27.3621, -55.9009, 'Posadas'],
    'bahia blanca': [-38.7196, -62.2724, 'Bahía Blanca'],
    parana: [-31.732, -60.5238, 'Paraná'],
    'san luis': [-33.3017, -66.3378, 'San Luis'],
    bariloche: [-41.1335, -71.3103, 'Bariloche'],
    ushuaia: [-54.8019, -68.303, 'Ushuaia'],
    jujuy: [-24.1858, -65.2995, 'Jujuy'],
  },
  CO: {
    bogota: [4.711, -74.0721, 'Bogotá'],
    medellin: [6.2476, -75.5658, 'Medellín'],
    cali: [3.4516, -76.532, 'Cali'],
    barranquilla: [10.9685, -74.7813, 'Barranquilla'],
    cartagena: [10.391, -75.4794, 'Cartagena'],
    bucaramanga: [7.1254, -73.1198, 'Bucaramanga'],
    cucuta: [7.8939, -72.5078, 'Cúcuta'],
    pereira: [4.8133, -75.6961, 'Pereira'],
    'santa marta': [11.2408, -74.199, 'Santa Marta'],
    ibague: [4.4389, -75.2322, 'Ibagué'],
    manizales: [5.0703, -75.5138, 'Manizales'],
    villavicencio: [4.142, -73.6266, 'Villavicencio'],
    pasto: [1.2136, -77.2811, 'Pasto'],
    monteria: [8.7479, -75.8814, 'Montería'],
    neiva: [2.9273, -75.2819, 'Neiva'],
    armenia: [4.5339, -75.6811, 'Armenia'],
    popayan: [2.4448, -76.6147, 'Popayán'],
    valledupar: [10.4631, -73.2532, 'Valledupar'],
    antioquia: [6.2476, -75.5658, 'Antioquia'],
    'valle del cauca': [3.4516, -76.532, 'Valle del Cauca'],
  },
  TR: {
    istanbul: [41.0082, 28.9784, 'Istanbul'],
    ankara: [39.9334, 32.8597, 'Ankara'],
    izmir: [38.4237, 27.1428, 'İzmir'],
    bursa: [40.1885, 29.061, 'Bursa'],
    antalya: [36.8969, 30.7133, 'Antalya'],
    adana: [37.0, 35.3213, 'Adana'],
    konya: [37.8746, 32.4932, 'Konya'],
    gaziantep: [37.0662, 37.3833, 'Gaziantep'],
    mersin: [36.8121, 34.6415, 'Mersin'],
    kayseri: [38.7312, 35.4787, 'Kayseri'],
    eskisehir: [39.7767, 30.5206, 'Eskişehir'],
    diyarbakir: [37.9144, 40.2306, 'Diyarbakır'],
    samsun: [41.2867, 36.33, 'Samsun'],
    denizli: [37.7765, 29.0864, 'Denizli'],
    trabzon: [41.0027, 39.7168, 'Trabzon'],
    bodrum: [37.0344, 27.4305, 'Bodrum'],
    mugla: [37.2153, 28.3636, 'Muğla'],
    kocaeli: [40.8533, 29.8815, 'Kocaeli'],
    sakarya: [40.7569, 30.3781, 'Sakarya'],
    malatya: [38.3552, 38.3095, 'Malatya'],
    erzurum: [39.9043, 41.2679, 'Erzurum'],
  },
  ZA: {
    johannesburg: [-26.2041, 28.0473, 'Johannesburg'],
    joburg: [-26.2041, 28.0473, 'Johannesburg'],
    'cape town': [-33.9249, 18.4241, 'Cape Town'],
    durban: [-29.8587, 31.0218, 'Durban'],
    pretoria: [-25.7479, 28.2293, 'Pretoria'],
    tshwane: [-25.7479, 28.2293, 'Pretoria'],
    gqeberha: [-33.9608, 25.6022, 'Gqeberha'],
    'port elizabeth': [-33.9608, 25.6022, 'Port Elizabeth'],
    bloemfontein: [-29.0852, 26.1596, 'Bloemfontein'],
    'east london': [-33.0153, 27.9116, 'East London'],
    polokwane: [-23.9045, 29.4689, 'Polokwane'],
    nelspruit: [-25.4753, 30.9694, 'Mbombela'],
    mbombela: [-25.4753, 30.9694, 'Mbombela'],
    kimberley: [-28.7282, 24.7499, 'Kimberley'],
    pietermaritzburg: [-29.6006, 30.3794, 'Pietermaritzburg'],
    stellenbosch: [-33.9321, 18.8602, 'Stellenbosch'],
    gauteng: [-26.2041, 28.0473, 'Gauteng'],
    'western cape': [-33.9249, 18.4241, 'Western Cape'],
    'kwazulu natal': [-29.8587, 31.0218, 'KwaZulu-Natal'],
  },
  NG: {
    lagos: [6.5244, 3.3792, 'Lagos'],
    abuja: [9.0765, 7.3986, 'Abuja'],
    kano: [12.0022, 8.592, 'Kano'],
    ibadan: [7.3775, 3.947, 'Ibadan'],
    'port harcourt': [4.8156, 7.0498, 'Port Harcourt'],
    'benin city': [6.335, 5.6037, 'Benin City'],
    kaduna: [10.5105, 7.4165, 'Kaduna'],
    enugu: [6.4584, 7.5464, 'Enugu'],
    onitsha: [6.1498, 6.7857, 'Onitsha'],
    warri: [5.5167, 5.75, 'Warri'],
    jos: [9.8965, 8.8583, 'Jos'],
    ilorin: [8.4966, 4.5421, 'Ilorin'],
    calabar: [4.9757, 8.3417, 'Calabar'],
    uyo: [5.0377, 7.9128, 'Uyo'],
    owerri: [5.484, 7.0351, 'Owerri'],
    abeokuta: [7.1475, 3.3619, 'Abeokuta'],
    akure: [7.2571, 5.2058, 'Akure'],
    maiduguri: [11.8311, 13.151, 'Maiduguri'],
    asaba: [6.2059, 6.6959, 'Asaba'],
  },
  // Additional major capitals & regional metros worldwide
  VN: {
    hanoi: [21.0278, 105.8342, 'Hanoi'],
    'ho chi minh': [10.8231, 106.6297, 'Ho Chi Minh City'],
    saigon: [10.8231, 106.6297, 'Ho Chi Minh City'],
    'da nang': [16.0544, 108.2022, 'Da Nang'],
    'hai phong': [20.8449, 106.6881, 'Hai Phong'],
    'can tho': [10.0452, 105.7469, 'Can Tho'],
    hue: [16.4637, 107.5909, 'Hue'],
  },
  MY: {
    'kuala lumpur': [3.139, 101.6869, 'Kuala Lumpur'],
    penang: [5.4141, 100.3288, 'Penang'],
    'johor bahru': [1.4927, 103.7414, 'Johor Bahru'],
    kuching: [1.5533, 110.3592, 'Kuching'],
    'kota kinabalu': [5.9804, 116.0735, 'Kota Kinabalu'],
    ipoh: [4.5975, 101.0901, 'Ipoh'],
    melaka: [2.1896, 102.2501, 'Melaka'],
    selangor: [3.0738, 101.5183, 'Selangor'],
    sabah: [5.9804, 116.0735, 'Sabah'],
    sarawak: [1.5533, 110.3592, 'Sarawak'],
  },
  CN: {
    beijing: [39.9042, 116.4074, 'Beijing'],
    shanghai: [31.2304, 121.4737, 'Shanghai'],
    guangzhou: [23.1291, 113.2644, 'Guangzhou'],
    shenzhen: [22.5431, 114.0579, 'Shenzhen'],
    chengdu: [30.5728, 104.0668, 'Chengdu'],
    hangzhou: [30.2741, 120.1551, 'Hangzhou'],
    wuhan: [30.5928, 114.3055, 'Wuhan'],
    nanjing: [32.0603, 118.7969, 'Nanjing'],
    chongqing: [29.563, 106.5516, 'Chongqing'],
    xian: [34.3416, 108.9398, "Xi'an"],
    tianjin: [39.3434, 117.3616, 'Tianjin'],
    harbin: [45.8038, 126.5349, 'Harbin'],
    kunming: [24.8801, 102.8329, 'Kunming'],
    guangdong: [23.1291, 113.2644, 'Guangdong'],
    fujian: [26.0745, 119.2965, 'Fujian'],
  },
  AU: {
    sydney: [-33.8688, 151.2093, 'Sydney'],
    melbourne: [-37.8136, 144.9631, 'Melbourne'],
    brisbane: [-27.4698, 153.0251, 'Brisbane'],
    perth: [-31.9505, 115.8605, 'Perth'],
    adelaide: [-34.9285, 138.6007, 'Adelaide'],
    canberra: [-35.2809, 149.13, 'Canberra'],
    hobart: [-42.8821, 147.3272, 'Hobart'],
    darwin: [-12.4634, 130.8456, 'Darwin'],
    'gold coast': [-28.0167, 153.4, 'Gold Coast'],
    newcastle: [-32.9283, 151.7817, 'Newcastle'],
    'new south wales': [-33.8688, 151.2093, 'New South Wales'],
    victoria: [-37.8136, 144.9631, 'Victoria'],
    queensland: [-27.4698, 153.0251, 'Queensland'],
    'western australia': [-31.9505, 115.8605, 'Western Australia'],
    'south australia': [-34.9285, 138.6007, 'South Australia'],
    tasmania: [-42.8821, 147.3272, 'Tasmania'],
  },
  NZ: {
    auckland: [-36.8485, 174.7633, 'Auckland'],
    wellington: [-41.2865, 174.7762, 'Wellington'],
    christchurch: [-43.5321, 172.6362, 'Christchurch'],
    hamilton: [-37.787, 175.2793, 'Hamilton'],
    dunedin: [-45.8788, 170.5028, 'Dunedin'],
    tauranga: [-37.6878, 176.1651, 'Tauranga'],
  },
  PE: {
    lima: [-12.0464, -77.0428, 'Lima'],
    arequipa: [-16.409, -71.5375, 'Arequipa'],
    trujillo: [-8.1116, -79.0288, 'Trujillo'],
    cusco: [-13.5319, -71.9675, 'Cusco'],
    chiclayo: [-6.7714, -79.8409, 'Chiclayo'],
    piura: [-5.1945, -80.6328, 'Piura'],
    iquitos: [-3.7437, -73.2516, 'Iquitos'],
    huancayo: [-12.0651, -75.2049, 'Huancayo'],
  },
  CL: {
    santiago: [-33.4489, -70.6693, 'Santiago'],
    valparaiso: [-33.0472, -71.6127, 'Valparaíso'],
    concepcion: [-36.8201, -73.0444, 'Concepción'],
    antofagasta: [-23.6509, -70.3975, 'Antofagasta'],
    temuco: [-38.7359, -72.5904, 'Temuco'],
    'la serena': [-29.9027, -71.2519, 'La Serena'],
    'puerto montt': [-41.4693, -72.9424, 'Puerto Montt'],
    iquique: [-20.2307, -70.1357, 'Iquique'],
  },
  EC: {
    quito: [-0.1807, -78.4678, 'Quito'],
    guayaquil: [-2.1894, -79.8891, 'Guayaquil'],
    cuenca: [-2.9001, -79.0059, 'Cuenca'],
    ambato: [-1.2543, -78.6229, 'Ambato'],
    manta: [-0.9677, -80.7089, 'Manta'],
    loja: [-3.9931, -79.2042, 'Loja'],
  },
  PK: {
    karachi: [24.8607, 67.0011, 'Karachi'],
    lahore: [31.5204, 74.3587, 'Lahore'],
    islamabad: [33.6844, 73.0479, 'Islamabad'],
    rawalpindi: [33.5651, 73.0169, 'Rawalpindi'],
    faisalabad: [31.4504, 73.135, 'Faisalabad'],
    peshawar: [34.0151, 71.5249, 'Peshawar'],
    multan: [30.1575, 71.5249, 'Multan'],
    quetta: [30.1798, 66.975, 'Quetta'],
  },
  BD: {
    dhaka: [23.8103, 90.4125, 'Dhaka'],
    chittagong: [22.3569, 91.7832, 'Chattogram'],
    chattogram: [22.3569, 91.7832, 'Chattogram'],
    sylhet: [24.8949, 91.8687, 'Sylhet'],
    khulna: [22.8456, 89.5403, 'Khulna'],
    rajshahi: [24.3745, 88.6042, 'Rajshahi'],
  },
  EG: {
    cairo: [30.0444, 31.2357, 'Cairo'],
    alexandria: [31.2001, 29.9187, 'Alexandria'],
    giza: [30.0131, 31.2089, 'Giza'],
    luxor: [25.6872, 32.6396, 'Luxor'],
    aswan: [24.0889, 32.8998, 'Aswan'],
  },
  MA: {
    casablanca: [33.5731, -7.5898, 'Casablanca'],
    rabat: [34.0209, -6.8416, 'Rabat'],
    marrakech: [31.6295, -7.9811, 'Marrakech'],
    tangier: [35.7595, -5.834, 'Tangier'],
    fez: [34.0181, -5.0078, 'Fez'],
    agadir: [30.4278, -9.5981, 'Agadir'],
  },
  KE: {
    nairobi: [-1.2921, 36.8219, 'Nairobi'],
    mombasa: [-4.0435, 39.6682, 'Mombasa'],
    kisumu: [-0.0917, 34.768, 'Kisumu'],
    nakuru: [-0.3031, 36.08, 'Nakuru'],
    eldoret: [0.5143, 35.2698, 'Eldoret'],
  },
  GH: {
    accra: [5.6037, -0.187, 'Accra'],
    kumasi: [6.6885, -1.6244, 'Kumasi'],
    takoradi: [4.8986, -1.7554, 'Takoradi'],
    tamale: [9.4034, -0.8424, 'Tamale'],
  },
  CA: {
    toronto: [43.6532, -79.3832, 'Toronto'],
    montreal: [45.5017, -73.5673, 'Montreal'],
    vancouver: [49.2827, -123.1207, 'Vancouver'],
    calgary: [51.0447, -114.0719, 'Calgary'],
    edmonton: [53.5461, -113.4938, 'Edmonton'],
    ottawa: [45.4215, -75.6972, 'Ottawa'],
    winnipeg: [49.8951, -97.1384, 'Winnipeg'],
    quebec: [46.8139, -71.208, 'Quebec City'],
    halifax: [44.6488, -63.5752, 'Halifax'],
    saskatoon: [52.1579, -106.6702, 'Saskatoon'],
    ontario: [43.6532, -79.3832, 'Ontario'],
    'british columbia': [49.2827, -123.1207, 'British Columbia'],
    alberta: [51.0447, -114.0719, 'Alberta'],
  },
  US: {
    'new york': [40.7128, -74.006, 'New York'],
    'los angeles': [34.0522, -118.2437, 'Los Angeles'],
    chicago: [41.8781, -87.6298, 'Chicago'],
    houston: [29.7604, -95.3698, 'Houston'],
    miami: [25.7617, -80.1918, 'Miami'],
    seattle: [47.6062, -122.3321, 'Seattle'],
    'san francisco': [37.7749, -122.4194, 'San Francisco'],
    boston: [42.3601, -71.0589, 'Boston'],
    atlanta: [33.749, -84.388, 'Atlanta'],
    dallas: [32.7767, -96.797, 'Dallas'],
    austin: [30.2672, -97.7431, 'Austin'],
    denver: [39.7392, -104.9903, 'Denver'],
    detroit: [42.3314, -83.0458, 'Detroit'],
    philadelphia: [39.9526, -75.1652, 'Philadelphia'],
    nashville: [36.1627, -86.7816, 'Nashville'],
    'new orleans': [29.9511, -90.0715, 'New Orleans'],
    portland: [45.5152, -122.6784, 'Portland'],
    minneapolis: [44.9778, -93.265, 'Minneapolis'],
    honolulu: [21.3069, -157.8583, 'Honolulu'],
    anchorage: [61.2181, -149.9003, 'Anchorage'],
    washington: [38.9072, -77.0369, 'Washington, D.C.'],
    california: [36.7783, -119.4179, 'California'],
    texas: [31.9686, -99.9018, 'Texas'],
    florida: [27.6648, -81.5158, 'Florida'],
  },
  GB: {
    london: [51.5074, -0.1278, 'London'],
    manchester: [53.4808, -2.2426, 'Manchester'],
    birmingham: [52.4862, -1.8904, 'Birmingham'],
    glasgow: [55.8642, -4.2518, 'Glasgow'],
    edinburgh: [55.9533, -3.1883, 'Edinburgh'],
    liverpool: [53.4084, -2.9916, 'Liverpool'],
    bristol: [51.4545, -2.5879, 'Bristol'],
    leeds: [53.8008, -1.5491, 'Leeds'],
    belfast: [54.5973, -5.9301, 'Belfast'],
    cardiff: [51.4816, -3.1791, 'Cardiff'],
    scotland: [55.9533, -3.1883, 'Scotland'],
    wales: [51.4816, -3.1791, 'Wales'],
  },
  FR: {
    paris: [48.8566, 2.3522, 'Paris'],
    lyon: [45.764, 4.8357, 'Lyon'],
    marseille: [43.2965, 5.3698, 'Marseille'],
    toulouse: [43.6047, 1.4442, 'Toulouse'],
    bordeaux: [44.8378, -0.5792, 'Bordeaux'],
    lille: [50.6292, 3.0573, 'Lille'],
    nantes: [47.2184, -1.5536, 'Nantes'],
    strasbourg: [48.5734, 7.7521, 'Strasbourg'],
    nice: [43.7102, 7.262, 'Nice'],
  },
  DE: {
    berlin: [52.52, 13.405, 'Berlin'],
    hamburg: [53.5511, 9.9937, 'Hamburg'],
    munich: [48.1351, 11.582, 'Munich'],
    munchen: [48.1351, 11.582, 'Munich'],
    cologne: [50.9375, 6.9603, 'Cologne'],
    koln: [50.9375, 6.9603, 'Cologne'],
    frankfurt: [50.1109, 8.6821, 'Frankfurt'],
    stuttgart: [48.7758, 9.1829, 'Stuttgart'],
    dusseldorf: [51.2277, 6.7735, 'Düsseldorf'],
    leipzig: [51.3397, 12.3731, 'Leipzig'],
  },
  ES: {
    madrid: [40.4168, -3.7038, 'Madrid'],
    barcelona: [41.3874, 2.1686, 'Barcelona'],
    valencia: [39.4699, -0.3763, 'Valencia'],
    sevilla: [37.3891, -5.9845, 'Seville'],
    seville: [37.3891, -5.9845, 'Seville'],
    bilbao: [43.263, -2.935, 'Bilbao'],
    malaga: [36.7213, -4.4214, 'Málaga'],
    zaragoza: [41.6488, -0.8891, 'Zaragoza'],
  },
  IT: {
    rome: [41.9028, 12.4964, 'Rome'],
    roma: [41.9028, 12.4964, 'Rome'],
    milan: [45.4642, 9.19, 'Milan'],
    milano: [45.4642, 9.19, 'Milan'],
    naples: [40.8518, 14.2681, 'Naples'],
    napoli: [40.8518, 14.2681, 'Naples'],
    turin: [45.0703, 7.6869, 'Turin'],
    torino: [45.0703, 7.6869, 'Turin'],
    florence: [43.7696, 11.2558, 'Florence'],
    firenze: [43.7696, 11.2558, 'Florence'],
    bologna: [44.4949, 11.3426, 'Bologna'],
    palermo: [38.1157, 13.3615, 'Palermo'],
  },
};

// Keys that are valid in station.state (Pass 1) but too ambiguous for station.name (Pass 2)
const NAME_FALLBACK_BLOCKLIST = new Set([
  'nice',
  'solo',
  'para',
  'natal',
  'vitoria',
  'leon',
  'salta',
  'santos',
  'armenia',
  'saga',
  'victoria',
  'washington',
  'lima',
]);

const CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/;
const SORTED_KEYS_CACHE = new Map();

function getSortedCountryKeys(code) {
  let cached = SORTED_KEYS_CACHE.get(code);
  if (!cached) {
    const table = CITY_REGION_COORDS[code];
    cached = table ? Object.keys(table).sort((a, b) => b.length - a.length) : [];
    SORTED_KEYS_CACHE.set(code, cached);
  }
  return cached;
}

/**
 * Normalize a location string (state or station name) for resilient city/region matching:
 * strips diacritics, removes hashtags (e.g. #qa), lowercases, preserves Unicode letters/CJK,
 * and collapses punctuation into single spaces.
 */
export function normalizeLocationKey(str) {
  return String(str ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/#[a-z0-9_-]+/gi, ' ')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function matchesLocationKey(paddedText, rawText, key) {
  if (CJK_RE.test(key)) {
    return rawText.includes(key);
  }
  return paddedText.includes(` ${key} `);
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export function hasValidGeo(station) {
  if (!station) return false;
  if (station.geo_lat === null || station.geo_lat === undefined || station.geo_lat === '') {
    return false;
  }
  if (station.geo_long === null || station.geo_long === undefined || station.geo_long === '') {
    return false;
  }
  const lat = Number(station.geo_lat);
  const lng = Number(station.geo_long);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return false;
  if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) return false;
  return true;
}

/**
 * Match an unpinned station's `state` (Pass 1) or `name` (Pass 2) against country-scoped
 * CITY_REGION_COORDS. Returns `{ lat, lng, label, precision: 'city' }` or `null`.
 */
export function resolveFallbackGeo(station) {
  if (!station || hasValidGeo(station)) return null;

  const code = String(station.countrycode || '').trim().toUpperCase();
  const table = CITY_REGION_COORDS[code];
  if (!table) return null;

  const keys = getSortedCountryKeys(code);

  // Pass 1: station.state (exact match first, then longest token-boundary match)
  const normState = normalizeLocationKey(station.state);
  if (normState) {
    const exact = table[normState];
    if (exact) {
      return { lat: exact[0], lng: exact[1], label: exact[2], precision: 'city' };
    }
    const paddedState = ` ${normState} `;
    for (const key of keys) {
      if (matchesLocationKey(paddedState, normState, key)) {
        const entry = table[key];
        return { lat: entry[0], lng: entry[1], label: entry[2], precision: 'city' };
      }
    }
  }

  // Pass 2: station.name (guarded against short call signs and ambiguous common words)
  const normName = normalizeLocationKey(station.name);
  if (normName) {
    const paddedName = ` ${normName} `;
    for (const key of keys) {
      const isCjk = CJK_RE.test(key);
      if (!isCjk && key.length < 4) continue;
      if (NAME_FALLBACK_BLOCKLIST.has(key)) continue;
      if (matchesLocationKey(paddedName, normName, key)) {
        const entry = table[key];
        return { lat: entry[0], lng: entry[1], label: entry[2], precision: 'city' };
      }
    }
  }

  return null;
}

/**
 * Unified station coordinate resolver:
 * 1. Tier 1 — Exact Radio Browser GPS (`precision: 'exact'`)
 * 2. Tier 2 — Pre-attached or lazily resolved City / Region match (`precision: 'city'`)
 * Returns `null` when only Tier 3 (Country Hub) is available.
 */
export function getStationGeo(station) {
  if (!station) return null;
  if (hasValidGeo(station)) {
    return {
      lat: Number(station.geo_lat),
      lng: Number(station.geo_long),
      precision: 'exact',
      label: station.state || '',
    };
  }
  if (
    station._geoPrecision === 'city' &&
    Number.isFinite(Number(station._geoLat)) &&
    Number.isFinite(Number(station._geoLng))
  ) {
    return {
      lat: Number(station._geoLat),
      lng: Number(station._geoLng),
      precision: 'city',
      label: station._geoLabel || station.state || '',
    };
  }
  return resolveFallbackGeo(station);
}

export function normalizeLongitude(lng) {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLon = (lon2 - lon1) * DEG2RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG2RAD) * Math.cos(lat2 * DEG2RAD) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDistanceKm(km) {
  if (!Number.isFinite(km)) return '';
  if (km < 1) return '< 1 km';
  if (km < 10) return `${km.toFixed(1)} km`;
  if (km < 1000) return `${Math.round(km)} km`;
  return `${Math.round(km).toLocaleString()} km`;
}

export function getSolarTimeInfo(lng, date = new Date()) {
  if (!Number.isFinite(lng)) return null;
  const offsetHours = Math.max(-12, Math.min(14, Math.round(lng / 15)));
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  const localTotalMinutes = ((utcMinutes + offsetHours * 60) % 1440 + 1440) % 1440;
  const hour24 = Math.floor(localTotalMinutes / 60);
  const minute = localTotalMinutes % 60;

  const hour12 = hour24 % 12 || 12;
  const ampm = hour24 < 12 ? 'AM' : 'PM';
  const formatted = `~${hour12}:${String(minute).padStart(2, '0')} ${ampm}`;

  let period = 'night';
  if (hour24 >= 5 && hour24 <= 11) period = 'morning';
  else if (hour24 >= 12 && hour24 <= 16) period = 'afternoon';
  else if (hour24 >= 17 && hour24 <= 21) period = 'evening';

  const meta = TIME_BAND_META[period];
  const sign = offsetHours >= 0 ? '+' : '';
  return {
    hour24,
    formatted,
    period,
    periodLabel: meta.label,
    icon: meta.icon,
    offsetLabel: `UTC${sign}${offsetHours}`,
  };
}

/**
 * Resolve solar time for a station: uses exact GPS or city-matched longitude when available,
 * or country centroid longitude for single-timezone countries (returns null for unpinned multi-TZ nations).
 */
export function getStationSolarTime(station, date = new Date()) {
  const geo = getStationGeo(station);
  if (geo) {
    return getSolarTimeInfo(geo.lng, date);
  }
  const code = (station?.countrycode || '').toUpperCase();
  if (!code || WIDE_MULTI_TZ_COUNTRIES.has(code)) return null;
  const centroid = COUNTRY_CENTROIDS[code];
  return centroid ? getSolarTimeInfo(centroid[1], date) : null;
}

/**
 * Compute longitude center where approximate local solar hour equals targetHour.
 */
export function getLongitudeForSolarHour(targetHour, date = new Date()) {
  const utcHour = date.getUTCHours() + date.getUTCMinutes() / 60;
  let diff = targetHour - utcHour;
  while (diff > 12) diff -= 24;
  while (diff < -12) diff += 24;
  return diff * 15;
}

/**
 * Compute the Earth's astronomical night-side terminator polygon across [-360, +360] longitude
 * so panning continuously across the antimeridian keeps night shading seamless.
 */
export function buildNightTerminatorPolygon(date = new Date()) {
  const julianDay = date.getTime() / 86400000 + 2440587.5;
  const n = julianDay - 2451545.0;

  // Sun mean longitude (L) and mean anomaly (g) in degrees
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * DEG2RAD;

  // Ecliptic longitude and obliquity
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG2RAD;
  const epsilon = (23.439 - 0.0000004 * n) * DEG2RAD;

  // Solar declination & right ascension
  const declination = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const rightAscension = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));

  // Greenwich Mean Sidereal Time (radians) -> subsolar longitude
  const gmstDeg = (280.46061837 + 360.98564736629 * n) % 360;
  const subsolarLonDeg = ((rightAscension * RAD2DEG - gmstDeg + 540) % 360) - 180;

  const tanDec = Math.tan(declination);
  const safeTanDec = Math.abs(tanDec) < 0.001 ? (tanDec >= 0 ? 0.001 : -0.001) : tanDec;

  const points = [];
  for (let lon = -360; lon <= 360; lon += 3) {
    const hourAngle = (lon - subsolarLonDeg) * DEG2RAD;
    const lat = Math.atan(-Math.cos(hourAngle) / safeTanDec) * RAD2DEG;
    points.push([Math.max(-85, Math.min(85, lat)), lon]);
  }

  // Close polygon over whichever pole is currently in polar night
  const darkPoleLat = declination >= 0 ? -85 : 85;
  points.push([darkPoleLat, 360]);
  points.push([darkPoleLat, -360]);
  return points;
}

export function getClusterCellSize(zoom) {
  if (zoom <= 2) return 3.6;
  if (zoom === 3) return 2.1;
  if (zoom === 4) return 1.15;
  if (zoom === 5) return 0.55;
  if (zoom === 6) return 0.25;
  if (zoom === 7) return 0.12;
  if (zoom === 8) return 0.05;
  if (zoom === 9) return 0.02;
  return 0.008;
}
