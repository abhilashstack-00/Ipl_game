const IPL_TEAMS = [
  { id: 'csk',  name: 'Chennai Super Kings',      short: 'CSK',  color: '#FFCC00', bg: '#1A237E', basePrice: 18, homeGround: 'MA Chidambaram Stadium, Chennai' },
  { id: 'mi',   name: 'Mumbai Indians',             short: 'MI',   color: '#004BA0', bg: '#005DA0', basePrice: 18, homeGround: 'Wankhede Stadium, Mumbai' },
  { id: 'rcb',  name: 'Royal Challengers Bengaluru',short: 'RCB',  color: '#EC1C24', bg: '#1A0000', basePrice: 16, homeGround: 'M. Chinnaswamy Stadium, Bengaluru' },
  { id: 'kkr',  name: 'Kolkata Knight Riders',      short: 'KKR',  color: '#3A225D', bg: '#3A225D', basePrice: 15, homeGround: 'Eden Gardens, Kolkata' },
  { id: 'dc',   name: 'Delhi Capitals',              short: 'DC',   color: '#17479E', bg: '#17479E', basePrice: 14, homeGround: 'Arun Jaitley Stadium, Delhi' },
  { id: 'srh',  name: 'Sunrisers Hyderabad',         short: 'SRH',  color: '#FF822A', bg: '#B34700', basePrice: 14, homeGround: 'Rajiv Gandhi Intl. Stadium, Hyderabad' },
  { id: 'rr',   name: 'Rajasthan Royals',             short: 'RR',   color: '#2D96D1', bg: '#004C91', basePrice: 13, homeGround: 'Sawai Mansingh Stadium, Jaipur' },
  { id: 'pbks', name: 'Punjab Kings',                 short: 'PBKS', color: '#DD1F2D', bg: '#800000', basePrice: 12, homeGround: 'Maharaja Yadavindra Singh Cricket Stadium' },
  { id: 'gt',   name: 'Gujarat Titans',               short: 'GT',   color: '#1C2951', bg: '#1C2951', basePrice: 12, homeGround: 'Narendra Modi Stadium, Ahmedabad' },
  { id: 'lsg',  name: 'Lucknow Super Giants',          short: 'LSG',  color: '#A0E1E1', bg: '#275DAD', basePrice: 11, homeGround: 'BRSABV Ekana Cricket Stadium, Lucknow' },
];

// IPL 2025 Schedule (static - can be replaced with live API)
const MATCH_SCHEDULE = [
  // Week 1
  { id: 'm01', team1: 'csk',  team2: 'rcb',  date: '2025-03-22', venue: 'Chepauk, Chennai',         result: { winner: 'csk',  method: 'normal' } },
  { id: 'm02', team1: 'mi',   team2: 'kkr',  date: '2025-03-23', venue: 'Wankhede, Mumbai',          result: { winner: 'kkr',  method: 'normal' } },
  { id: 'm03', team1: 'srh',  team2: 'dc',   date: '2025-03-24', venue: 'Uppal, Hyderabad',          result: { winner: 'srh',  method: 'normal' } },
  { id: 'm04', team1: 'rr',   team2: 'pbks', date: '2025-03-25', venue: 'Sawai Mansingh, Jaipur',    result: { winner: 'rr',   method: 'normal' } },
  { id: 'm05', team1: 'gt',   team2: 'lsg',  date: '2025-03-26', venue: 'Narendra Modi, Ahmedabad',  result: { winner: 'gt',   method: 'normal' } },
  { id: 'm06', team1: 'rcb',  team2: 'mi',   date: '2025-03-27', venue: 'Chinnaswamy, Bengaluru',    result: { winner: 'mi',   method: 'normal' } },
  { id: 'm07', team1: 'csk',  team2: 'kkr',  date: '2025-03-28', venue: 'Chepauk, Chennai',          result: null },
  // Week 2
  { id: 'm08', team1: 'dc',   team2: 'rr',   date: '2025-03-29', venue: 'Arun Jaitley, Delhi',       result: null },
  { id: 'm09', team1: 'srh',  team2: 'pbks', date: '2025-03-30', venue: 'Uppal, Hyderabad',          result: null },
  { id: 'm10', team1: 'lsg',  team2: 'csk',  date: '2025-03-31', venue: 'Ekana, Lucknow',            result: null },
  { id: 'm11', team1: 'mi',   team2: 'gt',   date: '2025-04-01', venue: 'Wankhede, Mumbai',          result: null },
  { id: 'm12', team1: 'kkr',  team2: 'rr',   date: '2025-04-02', venue: 'Eden Gardens, Kolkata',     result: null },
  { id: 'm13', team1: 'rcb',  team2: 'dc',   date: '2025-04-03', venue: 'Chinnaswamy, Bengaluru',    result: null },
  { id: 'm14', team1: 'pbks', team2: 'gt',   date: '2025-04-04', venue: 'Mullanpur, Punjab',         result: null },
  { id: 'm15', team1: 'csk',  team2: 'srh',  date: '2025-04-05', venue: 'Chepauk, Chennai',          result: null },
  // Week 3
  { id: 'm16', team1: 'mi',   team2: 'rr',   date: '2025-04-06', venue: 'Wankhede, Mumbai',          result: null },
  { id: 'm17', team1: 'lsg',  team2: 'kkr',  date: '2025-04-07', venue: 'Ekana, Lucknow',            result: null },
  { id: 'm18', team1: 'dc',   team2: 'pbks', date: '2025-04-08', venue: 'Arun Jaitley, Delhi',       result: null },
  { id: 'm19', team1: 'rcb',  team2: 'srh',  date: '2025-04-09', venue: 'Chinnaswamy, Bengaluru',    result: null },
  { id: 'm20', team1: 'gt',   team2: 'rr',   date: '2025-04-10', venue: 'Narendra Modi, Ahmedabad',  result: null },
  { id: 'm21', team1: 'csk',  team2: 'mi',   date: '2025-04-11', venue: 'Chepauk, Chennai',          result: null },
  { id: 'm22', team1: 'kkr',  team2: 'dc',   date: '2025-04-12', venue: 'Eden Gardens, Kolkata',     result: null },
  { id: 'm23', team1: 'pbks', team2: 'lsg',  date: '2025-04-13', venue: 'Mullanpur, Punjab',         result: null },
  // Week 4
  { id: 'm24', team1: 'srh',  team2: 'gt',   date: '2025-04-14', venue: 'Uppal, Hyderabad',          result: null },
  { id: 'm25', team1: 'rr',   team2: 'rcb',  date: '2025-04-15', venue: 'Sawai Mansingh, Jaipur',    result: null },
  { id: 'm26', team1: 'mi',   team2: 'dc',   date: '2025-04-16', venue: 'Wankhede, Mumbai',          result: null },
  { id: 'm27', team1: 'csk',  team2: 'gt',   date: '2025-04-17', venue: 'Chepauk, Chennai',          result: null },
  { id: 'm28', team1: 'lsg',  team2: 'rcb',  date: '2025-04-18', venue: 'Ekana, Lucknow',            result: null },
  { id: 'm29', team1: 'kkr',  team2: 'srh',  date: '2025-04-19', venue: 'Eden Gardens, Kolkata',     result: null },
  { id: 'm30', team1: 'pbks', team2: 'rr',   date: '2025-04-20', venue: 'Mullanpur, Punjab',         result: null },
];

module.exports = { IPL_TEAMS, MATCH_SCHEDULE };
