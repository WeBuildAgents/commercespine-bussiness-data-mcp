import {z} from 'zod';
import type {ApiClient} from './client.js';
export const nativeBusinessEntities=z.enum(['business_scope','business_information','business_sop','business_kpi_target','recurring_analysis','analysis_settings','evidence_check']);
export const nativeBusinessAction=z.enum(['create','revise','archive','set','upsert']);
export function nativeBusinessEnvelope(entity:string,action:string,parameters:Record<string,unknown>) {
  nativeBusinessEntities.parse(entity);nativeBusinessAction.parse(action);
  return {entity,actions:[action],scope:{},items:[{action,actionSchemaVersion:'1.0',parameters}]};
}
export async function nativeBusinessRequest(client:ApiClient,method:'GET'|'POST'|'PATCH',path:string,body?:unknown) {
  // Fixed route prefix: this adapter has no approval, execution or arbitrary URL primitive.
  return client.request(method,`/v1/native/business${path}`,body);
}
