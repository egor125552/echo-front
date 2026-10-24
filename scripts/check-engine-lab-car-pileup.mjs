import { createEchoFrontGame } from "../src/server/game.js";
import { EngineLab } from "../src/server/engine-lab.js";
for(const oldTraffic of [false,true]){
 const game=await createEchoFrontGame({mode:"battle-royale"});
 try{
  const lab=new EngineLab(game,{mode:"battle-royale",room:"local-validation"});
  const setup=lab.preparePileup({oldTraffic});
  if(setup.setup.bots!==95||setup.foundVehicles!==35||setup.setup.driversAtStart<15)
    throw Error("Incomplete pileup setup "+JSON.stringify(setup));
  const started=lab.start();
  const stepped=await lab.advance({steps:5,sampleEvery:5});
  if(stepped.steps!==5)throw Error("Not five simulation steps");
  console.log("LOCAL_LAB_VALIDATED",JSON.stringify({variant:oldTraffic?"baseline":"optimized",setup,at5:lab.pileupSummary(),steps:stepped.steps}));
 }finally{await game.host.stop()}
}
