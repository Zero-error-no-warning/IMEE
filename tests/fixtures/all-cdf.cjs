const {base,cdf}=require('./quality.cjs');
function mission(){const d=base();const quality={type:'cdf',qualityInput:'q',curves:[{q:0,points:[{t:10,p:0,q:.75}]},{q:1,points:[{t:10,p:1,q:.75}]}]};d.tasks[0].simulation={enabled:true,performanceModel:quality};d.tasks[1].simulation={enabled:true,performanceModel:cdf([{t:10,p:1,q:1}])};d.causalLinks[0].propagation.performanceModel={type:'cdf',qualityInput:'q',curves:[{q:0,points:[{t:0,p:0,q:1}]},{q:1,points:[{t:0,p:1,q:1}]}]};return d;}
module.exports={mission};
