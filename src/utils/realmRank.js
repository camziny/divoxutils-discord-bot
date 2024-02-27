function getRealmRanks() {
  const realmRanks = new Map();

  for (let rr = 0; rr < 100; rr++) {
    realmRanks.set(
      rr + 11,
      (50 * Math.pow(rr, 3) + 75 * Math.pow(rr, 2) + 25 * rr) / 6
    );
  }

  const hardcodedRanks = [
    [111, 9111713],
    [112, 10114001],
    [113, 11226541],
    [114, 12461460],
    [115, 13832221],
    [116, 15353765],
    [117, 17042680],
    [118, 18917374],
    [119, 20998286],
    [120, 23308097],
    [121, 25871988],
    [122, 28717906],
    [123, 31876876],
    [124, 35383333],
    [125, 39275499],
    [126, 43595804],
    [127, 48391343],
    [128, 53714390],
    [129, 59622973],
    [130, 66181501],
    [131, 73461466],
    [132, 81542227],
    [133, 90511872],
    [134, 100468178],
    [135, 111519678],
    [136, 123786843],
    [137, 137403395],
    [138, 152517769],
    [139, 169294723],
    [140, 187917143],
  ];

  for (const [rank, points] of hardcodedRanks) {
    realmRanks.set(rank, points);
  }

  return realmRanks;
}

const realmRanksMap = getRealmRanks();

function getRealmRankForPoints(points) {
  let rank = 0;

  for (const [rr, requiredPoints] of realmRanksMap) {
    if (points >= requiredPoints) {
      rank = rr;
    } else {
      break;
    }
  }

  return rank;
}

function formatRealmRankWithLevel(rank) {
  const rankString = rank.toString();
  return `${rankString.slice(0, -1)}L${rankString.slice(-1)}`;
}

module.exports = { getRealmRankForPoints, formatRealmRankWithLevel };
