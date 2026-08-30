export function distanceMetres(aLat:number,aLon:number,bLat:number,bLon:number){const r=6371000,toRad=(v:number)=>v*Math.PI/180;const dLat=toRad(bLat-aLat),dLon=toRad(bLon-aLon);const h=Math.sin(dLat/2)**2+Math.cos(toRad(aLat))*Math.cos(toRad(bLat))*Math.sin(dLon/2)**2;return Math.round(2*r*Math.asin(Math.sqrt(h)))}

