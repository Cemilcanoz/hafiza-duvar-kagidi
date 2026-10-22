/* Original layout controller. D3 v7.9.0 is vendored under vendor/D3-LICENSE. */
importScripts('/vendor/d3.min.js');
let simulation, timer, generation;
function send(type) {
  const nodes = simulation.nodes();
  const positions = new Float32Array(nodes.length * 2);
  nodes.forEach((n, i) => { positions[i * 2] = n.x; positions[i * 2 + 1] = n.y; });
  postMessage({type, generation, positions, alpha: simulation.alpha()}, [positions.buffer]);
}
function step() {
  timer = null;
  for (let i = 0; i < 3; i++) simulation.tick();
  if (simulation.alpha() < .004) { send('settled'); return; }
  send('tick'); timer = setTimeout(step, 25);
}
onmessage = ({data}) => {
  clearTimeout(timer);
  if (data.type === 'pause') { timer = null; return; }
  if (data.type === 'resume') { if (simulation && simulation.alpha() >= .004) timer = setTimeout(step, 0); return; }
  generation = data.generation;
  const nodes = data.nodes.map(n => ({id:n.id,x:n.x,y:n.y}));
  simulation = d3.forceSimulation(nodes).stop().randomSource(d3.randomLcg(.42))
    .force('links', d3.forceLink(data.edges.map(e=>({...e}))).id(n=>n.id).distance(42).strength(.12))
    .force('charge', d3.forceManyBody().strength(-45).theta(.9))
    .force('center', d3.forceCenter(0,0))
    .force('x', d3.forceX(0).strength(.008))
    .force('y', d3.forceY(0).strength(.008))
    .force('collide', d3.forceCollide(5).strength(.5))
    .velocityDecay(.5).alpha(data.warm ? .18 : 1).alphaDecay(.035);
  timer = setTimeout(step,0);
};
