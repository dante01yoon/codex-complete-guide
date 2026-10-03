export const TRACK = Object.freeze({
  outerA: 78, outerB: 47, innerA: 58, innerB: 27,
  centerA: 68, centerB: 37, startAngle: -Math.PI / 2,
});

export function isOnTrack({ x, z }) {
  const outer = (x / TRACK.outerA) ** 2 + (z / TRACK.outerB) ** 2;
  const inner = (x / TRACK.innerA) ** 2 + (z / TRACK.innerB) ** 2;
  return outer <= 1 + 1e-9 && inner >= 1 - 1e-9;
}

export function trackPoint(angle, a = TRACK.centerA, b = TRACK.centerB) {
  return { x: a * Math.cos(angle), z: b * Math.sin(angle) };
}

export function getGate(index) {
  const angle = TRACK.startAngle + index * Math.PI / 2;
  const inner = trackPoint(angle, TRACK.innerA, TRACK.innerB);
  const outer = trackPoint(angle, TRACK.outerA, TRACK.outerB);
  const center = trackPoint(angle);
  const dx = -TRACK.centerA * Math.sin(angle);
  const dz = TRACK.centerB * Math.cos(angle);
  const length = Math.hypot(dx, dz);
  return { inner, outer, center, tangent: { x: dx / length, z: dz / length } };
}

// Return the fractional crossing time only for a forward crossing within the road.
export function crossGate(previous, current, gate) {
  const signedDistance = (point) => {
    const distance = (point.x - gate.center.x) * gate.tangent.x + (point.z - gate.center.z) * gate.tangent.z;
    return Math.abs(distance) < 1e-9 ? 0 : distance;
  };
  const before = signedDistance(previous);
  const after = signedDistance(current);
  if (before >= 0 || after < 0) return null;
  const fraction = -before / (after - before);
  const x = previous.x + (current.x - previous.x) * fraction;
  const z = previous.z + (current.z - previous.z) * fraction;
  const gx = gate.outer.x - gate.inner.x;
  const gz = gate.outer.z - gate.inner.z;
  const along = ((x - gate.inner.x) * gx + (z - gate.inner.z) * gz) / (gx * gx + gz * gz);
  return along >= 0 && along <= 1 && isOnTrack({ x, z }) ? fraction : null;
}

export function createTrack(THREE) {
  const world = new THREE.Group();
  const material = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: .9, ...extra });
  const asphalt = material('#465650');
  const grass = material('#829d77');
  const pale = material('#e7e5cf');
  const orange = material('#ef7047');
  const metal = material('#647770');
  const concrete = material('#a9b19b');
  const dark = material('#233d34');
  const addBox = (width, height, depth, mat, x, y, z, rotation = 0) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = rotation;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    world.add(mesh);
    return mesh;
  };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), grass);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.add(ground);

  function ring(innerA, innerB, outerA, outerB, mat, height) {
    const vertices = [], indices = [];
    const segments = 192;
    for (let i = 0; i <= segments; i++) {
      const angle = i / segments * Math.PI * 2;
      vertices.push(innerA * Math.cos(angle), height, innerB * Math.sin(angle));
      vertices.push(outerA * Math.cos(angle), height, outerB * Math.sin(angle));
      if (i < segments) {
        const j = i * 2;
        indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.receiveShadow = true;
    world.add(mesh);
  }
  ring(TRACK.innerA, TRACK.innerB, TRACK.outerA, TRACK.outerB, asphalt, .04);
  ring(TRACK.innerA + .6, TRACK.innerB + .6, TRACK.innerA + .85, TRACK.innerB + .85, pale, .055);
  ring(TRACK.outerA - .85, TRACK.outerB - .85, TRACK.outerA - .6, TRACK.outerB - .6, pale, .055);

  for (let i = 0; i < 100; i++) {
    const angle = i / 100 * Math.PI * 2;
    for (const [a, b] of [[TRACK.outerA + .65, TRACK.outerB + .65], [TRACK.innerA - .65, TRACK.innerB - .65]]) {
      const p = trackPoint(angle, a, b);
      const yaw = Math.atan2(-a * Math.sin(angle), b * Math.cos(angle));
      addBox(1.15, .1, 2.65, i % 2 ? pale : orange, p.x, .075, p.z, yaw);
    }
    if (i % 2 === 0) {
      const p = trackPoint(angle);
      const yaw = Math.atan2(-TRACK.centerA * Math.sin(angle), TRACK.centerB * Math.cos(angle));
      addBox(.12, .015, 2.5, pale, p.x, .065, p.z, yaw);
    }
  }

  // Checkerboard start line across the full width of the road.
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 20; col++) {
      addBox(.75, .025, 1, (row + col) % 2 ? pale : dark, row * .75 - .375, .08, -46.5 + col);
    }
  }
  // Direction arrows before the line, facing +X.
  for (const x of [-12, -20]) {
    const shape = new THREE.Shape();
    shape.moveTo(-1.7, -.55); shape.lineTo(.2, -.55); shape.lineTo(.2, -1.2);
    shape.lineTo(1.7, 0); shape.lineTo(.2, 1.2); shape.lineTo(.2, .55); shape.lineTo(-1.7, .55);
    shape.closePath();
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), pale);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, .085, -37);
    world.add(mesh);
  }

  // A small start gantry and warm orange timing banner.
  addBox(.6, 11.8, .6, metal, 0, 5.9, -49);
  addBox(.6, 11.8, .6, metal, 0, 5.9, -25);
  addBox(.85, 1.7, 25, orange, 0, 11.1, -37);
  const bannerCanvas = document.createElement('canvas');
  bannerCanvas.width = 1024; bannerCanvas.height = 128;
  const context = bannerCanvas.getContext('2d');
  context.fillStyle = '#ef7047'; context.fillRect(0, 0, 1024, 128);
  context.fillStyle = '#203a30'; context.font = 'bold 63px sans-serif'; context.textAlign = 'center';
  context.fillText('O V A L   /   G A R D E N   C I R C U I T', 512, 86);
  const bannerTexture = new THREE.CanvasTexture(bannerCanvas);
  bannerTexture.colorSpace = THREE.SRGBColorSpace;
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(24, 1.65), new THREE.MeshBasicMaterial({ map: bannerTexture, side: THREE.DoubleSide }));
  banner.rotation.y = -Math.PI / 2; banner.position.set(-.44, 11.1, -37);
  world.add(banner);

  // Low, open fencing keeps the track readable without blocking the car.
  const railPoints = [];
  for (let i = 0; i <= 128; i++) {
    const angle = i / 128 * Math.PI * 2;
    const p = trackPoint(angle, 86, 55);
    railPoints.push(new THREE.Vector3(p.x, 1.15, p.z));
    if (i < 128 && i % 2 === 0) addBox(.22, 1.7, .22, metal, p.x, .85, p.z);
  }
  const rails = new THREE.Line(new THREE.BufferGeometry().setFromPoints(railPoints), new THREE.LineBasicMaterial({ color: '#d0d6b9' }));
  world.add(rails);
  const lowerRail = rails.clone(); lowerRail.position.y = -.55; world.add(lowerRail);

  // Grandstands, pit shelter, infield landscaping. All assets are procedural.
  for (let row = 0; row < 4; row++) {
    addBox(42, .7 + row * .65, 2.5, concrete, -26, (.7 + row * .65) / 2, 57 + row * 2.5);
    for (let seat = 0; seat < 22; seat++) {
      addBox(.95, .3, .85, seat % 5 === 0 ? orange : dark, -46 + seat * 1.9, .9 + row * .65, 57 + row * 2.5);
    }
  }
  for (const x of [-49, -5]) {
    addBox(.4, 8, .4, metal, x, 4, 57);
    addBox(.4, 8, .4, metal, x, 4, 66);
  }
  addBox(48, .3, 12, dark, -27, 8, 61);
  addBox(30, .2, 8, pale, 23, 4, -61);
  for (const x of [9, 37]) for (const z of [-64, -58]) addBox(.35, 4, .35, metal, x, 2, z);
  addBox(30, .12, 10, concrete, 23, .06, -61);
  addBox(7, 1.1, 3, orange, 24, .6, -62);

  const trunkMat = material('#75654c');
  const foliageMats = ['#416d52', '#517b59', '#5e835d'].map(color => material(color));
  const trunkGeo = new THREE.CylinderGeometry(.3, .45, 2.8, 6);
  const crownGeo = new THREE.IcosahedronGeometry(3.6, 0);
  function tree(x, z, scale, index) {
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, 1.4 * scale, z); trunk.scale.setScalar(scale); trunk.castShadow = true;
    const crown = new THREE.Mesh(crownGeo, foliageMats[index % 3]);
    crown.position.set(x, 4.6 * scale, z); crown.scale.set(scale, 1.15 * scale, scale);
    crown.rotation.y = index * .7; crown.castShadow = true;
    world.add(trunk, crown);
  }
  for (let i = 0; i < 45; i++) {
    const angle = i * 2.39996;
    const radius = 100 + (i % 7) * 8;
    tree(Math.cos(angle) * radius, Math.sin(angle) * radius * .8, .8 + (i % 4) * .16, i);
  }
  for (const [i, x, z] of [[0, -25, -5], [1, -18, 5], [2, 23, 8], [3, 31, 3], [4, 27, -5]]) tree(x, z, .85, i);
  addBox(29, .18, 7, concrete, 0, .09, 2);
  const infieldCanvas = document.createElement('canvas');
  infieldCanvas.width = 1024; infieldCanvas.height = 256;
  const ctx = infieldCanvas.getContext('2d');
  ctx.fillStyle = '#a9b19b'; ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = '#536c57'; ctx.font = '900 165px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('O V A L', 512, 185);
  const infieldTexture = new THREE.CanvasTexture(infieldCanvas); infieldTexture.colorSpace = THREE.SRGBColorSpace;
  const infield = new THREE.Mesh(new THREE.PlaneGeometry(28, 6.8), new THREE.MeshBasicMaterial({ map: infieldTexture }));
  infield.rotation.x = -Math.PI / 2; infield.rotation.z = Math.PI;
  infield.position.set(0, .19, 2); world.add(infield);
  return world;
}
