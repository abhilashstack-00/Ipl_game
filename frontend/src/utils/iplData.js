export const IPL_TEAMS = [
  { id: 'csk',  name: 'Chennai Super Kings',       short: 'CSK',  color: '#FFCC00', bg: '#1A237E', basePrice: 18 },
  { id: 'mi',   name: 'Mumbai Indians',              short: 'MI',   color: '#00D4FF', bg: '#004BA0', basePrice: 18 },
  { id: 'rcb',  name: 'Royal Challengers Bengaluru', short: 'RCB',  color: '#EC1C24', bg: '#3A0000', basePrice: 16 },
  { id: 'kkr',  name: 'Kolkata Knight Riders',       short: 'KKR',  color: '#B3A123', bg: '#3A225D', basePrice: 15 },
  { id: 'dc',   name: 'Delhi Capitals',               short: 'DC',   color: '#6AABFF', bg: '#17479E', basePrice: 14 },
  { id: 'srh',  name: 'Sunrisers Hyderabad',          short: 'SRH',  color: '#FF822A', bg: '#7A3000', basePrice: 14 },
  { id: 'rr',   name: 'Rajasthan Royals',              short: 'RR',   color: '#2D96D1', bg: '#00336A', basePrice: 13 },
  { id: 'pbks', name: 'Punjab Kings',                  short: 'PBKS', color: '#FF5555', bg: '#6B0000', basePrice: 12 },
  { id: 'gt',   name: 'Gujarat Titans',                short: 'GT',   color: '#B9B0A2', bg: '#1C2951', basePrice: 12 },
  { id: 'lsg',  name: 'Lucknow Super Giants',           short: 'LSG',  color: '#A0E1E1', bg: '#275DAD', basePrice: 11 },
]

export function getTeam(id) {
  return IPL_TEAMS.find(t => t.id === id) || { id, name: id, short: id?.toUpperCase(), color: '#888', bg: '#333', basePrice: 10 }
}

export const MAX_TEAMS = 5
export const STARTING_CREDITS = 100
