// 로컬 개발 전용: 루프백 HTTP 요청만 처리한다. 배포용 Worker가 아니다.
import { createPilotWorker } from './pilot-worker.mjs';

export function createLocalPilotWorker(dependencies) {
  const worker = createPilotWorker(dependencies);
  return {
    fetch(request, env) {
      const url = new URL(request.url);
      if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return new Response(null, {status: 403});
      // 로컬 개발에서는 호출 횟수를 제한하지 않는다. 로그인·멤버십 검사는 그대로 적용된다.
      const unlimited = { idFromName: () => 'local', get: () => ({fetch: async () => new Response(null, {status:200})}) };
      return worker.fetch(request, {...env, PILOT_BUDGET: unlimited});
    }
  };
}
export default createLocalPilotWorker();
