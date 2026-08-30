import {describe,expect,it} from "vitest"
import {distanceMetres} from "../geofence"
describe("HR geofence",()=>{it("returns zero for the same point",()=>expect(distanceMetres(43.659,11.184,43.659,11.184)).toBe(0));it("measures a plausible distance",()=>expect(distanceMetres(43.659,11.184,43.660,11.184)).toBeGreaterThanOrEqual(110))})
