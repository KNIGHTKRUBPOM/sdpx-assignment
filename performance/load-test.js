import http from 'k6/http';
import { check, sleep } from 'k6';
const fixtures=JSON.parse(__ENV.TEST_FIXTURE);
export const options={
  stages:[{duration:'10s',target:10},{duration:'10s',target:30},{duration:'20s',target:30},{duration:'5s',target:0}],
  thresholds:{http_req_failed:['rate<0.01'],'http_req_duration{name:evaluations}':['p(95)<2000'],'http_req_duration{name:autosave}':['p(95)<300'],'http_req_duration{name:submit}':['p(95)<800']},
};
export default function(){
  const user=fixtures.users[(__VU-1)%fixtures.users.length];
  const headers={Cookie:`next-auth.session-token=${user.cookie}`,Origin:fixtures.origin,'Content-Type':'application/json'};
  const url=`${fixtures.baseUrl}/api/assignments/${fixtures.assignmentId}`;
  const get=http.get(`${url}/my-evaluations?side=GROUP`,{headers,tags:{name:'evaluations'}});
  if(!check(get,{'evaluation 200':r=>r.status===200}))return;
  const pair=get.json().comparisons[0];if(!pair)return;
  const saved=http.put(`${fixtures.baseUrl}/api/comparisons/${pair.pairAssignmentId}`,JSON.stringify({choice:(__ITER%6)+1,expectedVersion:pair.version,timeOnTaskMs:3000}),{headers,tags:{name:'autosave'}});
  check(saved,{'autosave 200':r=>r.status===200});
  sleep(.5);
  const submitted=http.post(`${url}/submissions`,JSON.stringify({side:'GROUP'}),{headers:{...headers,'Idempotency-Key':`load-${__VU}-${__ITER}`},tags:{name:'submit'}});
  check(submitted,{'submit 200':r=>r.status===200});sleep(1);
}
