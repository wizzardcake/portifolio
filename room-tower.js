/* The stair tower's plan: geometry only, in metres, with the chamber's centre
   at the origin and +Z toward the seated viewer (room-scene.js's plan
   coordinates). room-scene.js builds the tower from it, the walk plan
   (first-person.js, through studyRoom.walk) keeps to it, and the
   architecture check tests against it.

   The tower stands outside the chamber's bay at -30 degrees (back right) and
   opens into the chamber through the whole bay. Its drum is wide enough for a
   stair that a visitor can climb in first person: it grows outward, away from
   the hall. The circle meets the chamber a hand's breadth beyond the outer
   corners of its bay, so it hardly reaches into the hall, and its wall stays
   clear of the bookshelf niche and the blind arch on either side (both are
   recessed almost through their walls). */
export function towerLayout({apothem: A, wall: T, sides}) {
  const bay = -Math.PI / 6, deg = Math.PI / 180;
  // The bay's outer corners, where the neighbouring walls end.
  const corner = (A + T) * Math.tan(Math.PI / sides);
  // r: the drum's inside radius; meet: how far out the circle passes the
  // corners' line (its chord there is the bay's full outer width).
  const r = 1.7, height = 7, meet = A + T + .1;
  const out = meet + Math.sqrt(r * r - corner * corner);
  const tower = {r, height, x: out * Math.cos(bay), z: out * Math.sin(bay), bay, meet, corner};
  // Its wall runs round the back from one side of the bay to the other; the
  // mouth between is the bay's opening, seen from the tower's axis.
  const mouthWidth = Math.atan2(corner, out - meet), mouthDirection = bay + Math.PI;
  tower.wallFrom = mouthDirection + mouthWidth; tower.wallTo = mouthDirection - mouthWidth + 2 * Math.PI;
  tower.mouthDirection = mouthDirection; tower.mouthWidth = mouthWidth;

  // The spiral stair along the wall. Step i spans plan angles from - (i+1)*step
  // .. from - i*step; the step is negative, so it climbs with the angle
  // (counterclockwise in plan). It starts just inside the mouth on the left
  // (as seen from the chamber) and climbs rightward round the back wall to the
  // upper floor, one riser below the gallery's floor: seen from the entry,
  // the middle of the flight rises across the mouth. A metre-wide tread round an
  // open shaft: at the walking line (1.2 m from the axis) each step is 0.27 m
  // deep for a 0.19 m rise, an ordinary staircase's pitch; the narrowest part
  // anyone walks (beside the handrail) is still 0.23 m deep.
  // soffit: thickness of the flight under the line through the nosings, square
  // to its slope; joint: how far each stone's underside is tucked up at the
  // next one; cap/nosing: each nosing's thickness and how far it overhangs the riser.
  const stair = {from: mouthDirection + mouthWidth + 7 * deg, step: -13 * deg, rise: .19, inner: .70, count: 14,
    soffit: .15, joint: .018, cap: .045, nosing: .028};
  const tread = i => (i + 1) * stair.rise;
  // The open stairwell in the upper floor: over the flight from where a
  // visitor's head would come near the floor's underside (from the fourth step,
  // `to`) to the top (`from`), and the open shaft inside the flight (radius
  // `inner`).
  const well = {from: stair.from - stair.count * stair.step, to: stair.from - 3 * stair.step, inner: stair.inner - .06};
  // Tall, narrow lancets in the wall over the climbing flight: each sill clears
  // the highest tread beneath its opening; seen from the table through the
  // mouth, across the back wall.
  const lancets = [4.2, 7.4, 10.6].map(k => {
    const at = stair.from - k * stair.step, halfWidth = .18;
    const sill = Math.round((tread(Math.floor((stair.from - at) / stair.step + halfWidth / r / Math.abs(stair.step))) + .18) * 100) / 100;
    return {at, halfWidth, sill, shoulder: sill + 1.5, peak: sill + 1.85};
  });
  return {tower, stair, well, lancets, tread};
}
