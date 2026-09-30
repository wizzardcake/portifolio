/* Physical furniture only. The original screen remains the coordinate system
   for the orb, cards and page; shrinking the table never scales those systems. */
(() => {
  const screen = document.getElementById('screen');
  if (!screen) return;
  const table = screen.querySelector('.portal-table'), top = table.querySelector('.portal-table-top');
  const opening = document.createElement('i');
  opening.className = 'table-aperture'; opening.setAttribute('aria-hidden', 'true');
  screen.append(opening);
  const lining = document.createElement('div');
  lining.className = 'table-circular-lining'; lining.setAttribute('aria-hidden', 'true');
  const sides = Array.from({length:48}, () => {
    const side = document.createElement('i'); lining.append(side); return side;
  });
  screen.append(lining);
  let shape = null, framing = null, wallDepth = 24;
  function updateWell(depth = wallDepth) {
    wallDepth = depth;
    if (!shape) return;
    const r = shape.radius, step = Math.PI * 2 / sides.length;
    sides.forEach((side, i) => {
      const angle = (i + .5) * step;
      side.style.cssText = `left:${screen.clientWidth/2+r*Math.cos(angle)}px;top:${screen.clientHeight/2+r*Math.sin(angle)}px;` +
        `width:${2*r*Math.tan(step/2)+.7}px;height:${wallDepth}px;transform:translateX(-50%) rotateZ(${angle+Math.PI/2}rad) rotateX(-90deg)`;
    });
  }
  function measure() {
    const css = getComputedStyle(table), sw = screen.clientWidth, sh = screen.clientHeight;
    const width = sw * parseFloat(css.getPropertyValue('--table-width'));
    const height = width / parseFloat(css.getPropertyValue('--table-aspect'));
    const radius = Math.min(width, height) * parseFloat(css.getPropertyValue('--table-opening')) / 2;
    const outline = [[-width/4,-height/2],[width/4,-height/2],[width/2,0],
      [width/4,height/2],[-width/4,height/2],[-width/2,0]];
    shape = {width, height, radius, outline};
    // Preserve the seated framing of the old furniture. Otherwise the fit
    // camera moves closer to a smaller table and enlarges the unchanged orb.
    const rx=parseFloat(css.getPropertyValue('--rim-x')), rb=parseFloat(css.getPropertyValue('--rim-back'));
    const rf=parseFloat(css.getPropertyValue('--rim-front'));
    // Match the old clientWidth/offsetTop rounding as well as its proportions.
    framing = {width:Math.round(sw*(1+2*rx)),
      front:Math.round(-sh*rb)+Math.round(sh*(1+rb+rf))-sh/2};
    table.style.width = width+'px'; table.style.height = height+'px';
    table.style.left = (sw-width)/2+'px'; table.style.top = (sh-height)/2+'px';
    screen.style.setProperty('--table-aperture-radius', radius+'px');
    const outer = outline.map(([x,y],i)=>(i?'L':'M')+(x+width/2)+' '+(y+height/2)).join(' ')+' Z';
    const x=width/2,y=height/2;
    top.style.clipPath = `path(evenodd, "${outer} M${x-radius} ${y} A${radius} ${radius} 0 1 0 ${x+radius} ${y} A${radius} ${radius} 0 1 0 ${x-radius} ${y} Z")`;
    opening.style.cssText = `left:${sw/2-radius}px;top:${sh/2-radius}px;width:${radius*2}px;height:${radius*2}px`;
    updateWell();
    window.sceneCamera?.update();
  }
  window.portalTable = {
    measure, updateWell,
    get geometry() { return shape; }, get framing() { return framing; },
    boundary(bleed = 0) {
      const r = shape.radius * (1 + bleed);
      return Array.from({length:64}, (_,i)=>[r*Math.cos(i*Math.PI/32),r*Math.sin(i*Math.PI/32)]);
    },
  };
  measure();
  new ResizeObserver(measure).observe(screen);
  addEventListener('resize', measure);
})();
