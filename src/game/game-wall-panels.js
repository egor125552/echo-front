// Procedural *fictional game* geometry. Preserve the original solid wall
// silhouette while replacing selected sections with independently breakable panes.
export function gameWallPanels(spec){
  const alongX=spec.hx>=spec.hz, half=alongX?spec.hx:spec.hz;
  const height=Number(spec.height)||0, y=Number(spec.y)||0;
  if(spec.kind!=="building-wall"||!spec.glazing||half<1.8||height<2.4||y<-.1)return [spec];
  const count=Math.min(3,Math.max(1,Math.floor(half*2/5)));
  const segment=half*2/count, result=[];
  const part=(offset,span,bottom,h,extra={})=>{
    if(span<.025||h<.025)return;
    const {glazing,...base}=spec;
    result.push({...base,...extra,x:spec.x+(alongX?offset:0),z:spec.z+(alongX?0:offset),
      y:y+bottom,height:h,hx:alongX?span/2:spec.hx,hz:alongX?spec.hz:span/2});
  };
  for(let i=0;i<count;i++){
    const center=-half+segment*(i+.5), opening=Math.min(1.5,segment*.42);
    const side=(segment-opening)/2, sill=.92, paneH=Math.min(1.18,height-sill-.4);
    part(center-(opening+side)/2,side,0,height);
    part(center+(opening+side)/2,side,0,height);
    part(center,opening,0,sill);
    part(center,opening,sill+paneH,height-sill-paneH);
    part(center,opening,sill,paneH,{kind:"building-window",material:"glass",accessibleName:"окно",acousticOcclusion:.48});
  }
  return result;
}
