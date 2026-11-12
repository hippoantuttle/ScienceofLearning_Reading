'use strict';
// Dormant TASK-024 foundation: the product UI must explicitly connect this gate.
var ReadingSupport = (() => {
  const source = typeof module !== 'undefined' ? require('./sentence-source.js') : SentenceSource;
  const contract = typeof module !== 'undefined' ? require('./reading-support-contract.js') : ReadingSupportContract;
  function createEditor({article, candidateIds = []}) {
    const snapshot = source.segment(article);
    if (!Array.isArray(candidateIds) || new Set(candidateIds).size !== candidateIds.length || candidateIds.some(id => !snapshot.sentences.some(s => s.id === id))) throw Error('invalid_candidates');
    const offered = candidateIds.slice();
    let structureType = null, nodes = [], edges = [], nextId = 0;
    const read = () => ({structureType, nodes:structuredClone(nodes), edges:structuredClone(edges)});
    const context = () => ({structureType, sentences:snapshot.sentences, candidateIds:offered});
    return {
      read,
      selectType(type) {
        if (!Object.hasOwn(contract.relations,type)) throw Error('invalid_type');
        // Preserve learner work; a changed type can require explicit edge/role edits.
        structureType = type; return read();
      },
      add(sentenceId) {
        if (nodes.some(n => n.sentenceId === sentenceId)) throw Error('duplicate_sentence');
        const sentence = snapshot.sentences.find(s => s.id === sentenceId);
        if (!sentence || nodes.length >= 8 || nextId >= 9999) throw Error('invalid_card');
        nodes.push({id:'n'+(++nextId),sentenceId,text:sentence.text,role:null,source:offered.includes(sentenceId)?'ai_candidate':'learner_added',order:nodes.length});
        return read();
      },
      place(nodeId, role) {
        const node = nodes.find(n => n.id === nodeId);
        if (!node || !['primary','support'].includes(role) || !structureType) throw Error('invalid_placement');
        node.role = role; return read();
      },
      exclude(nodeId) {
        if (!nodes.some(n => n.id === nodeId)) throw Error('invalid_card');
        nodes = nodes.filter(n => n.id !== nodeId).map((n,order) => ({...n,order}));
        edges = edges.filter(e => e.from !== nodeId && e.to !== nodeId); return read();
      },
      connect(from, to, relationType) {
        const rule = contract.relations[structureType], a = nodes.find(n => n.id === from), b = nodes.find(n => n.id === to);
        if (!rule || !a || !b || from === to || a.role !== rule.from || b.role !== rule.to || relationType !== rule.type || edges.length >= 16 || edges.some(e => e.from === from && e.to === to)) throw Error('invalid_connection');
        edges.push({from,to,relationType}); return read();
      },
      disconnect(from,to) { edges = edges.filter(e => e.from !== from || e.to !== to); return read(); },
      validate() { return contract.graph({nodes,edges},context()); },
      textFields() { return contract.textFields({nodes,edges},context()); }
    };
  }
  function create({article, accountId, mode = 'independent', enabled = false, kind = 'web'}) {
    if (!['guided','independent'].includes(mode)) throw Error('invalid_mode');
    let snapshot = null;
    try { if (kind === 'web') snapshot = source.segment(article); } catch {}
    let phase = 'preparation', status = 'idle', generation = 0, attempts = 0, closed = false, controller = null, candidates = [], offered = [], exposed = false, retryable = false, failureReason = null;
    function cancel() { generation++; controller?.abort(); controller = null; }
    function close() { cancel(); closed = true; if (status === 'pending') status = 'cancelled'; }
    function current(g) { return g === generation && !closed && phase === 'reading'; }
    return {
      start() { if (phase !== 'preparation') throw Error('invalid_phase'); phase = 'reading'; },
      async request(adapter, {consent, requestId} = {}) {
        if (closed || phase !== 'reading' || mode !== 'guided' || !enabled || !accountId || kind !== 'web' || !snapshot || snapshot.sentences.length < 2 || consent !== true || attempts >= 2 || status === 'pending' || status === 'ready' || (attempts > 0 && !retryable)) throw Error('request_not_allowed');
        const body = {schemaVersion:1, requestId, segmentationVersion:source.VERSION, article:snapshot.article};
        contract.request(body);
        cancel(); const g = generation, localController = new AbortController(); controller = localController;
        status = 'pending'; attempts++; retryable = false;failureReason=null;
        try {
          const documentHash = await source.hash(snapshot.article);
          if (!current(g)) return null;
          const result = await adapter(body, {signal:localController.signal});
          if (!current(g)) return null;
          candidates = contract.response(result, {requestId, documentHash, sentences:snapshot.sentences});
          status = 'ready';
          return {generation:g, sentences:snapshot.sentences.filter(s => candidates.includes(s.id)).map(s => ({...s}))};
        } catch (error) {
          if (!current(g)) return null; // Late failure is as stale as late success.
          status = 'failed'; failureReason=['disabled','cohort_expired','selftest_expired'].includes(error?.code)?error.code:({401:'unauthorized',403:'inactive',429:'limit',413:'too_large'})[error?.status] || (error?.name==='AbortError'?'timeout':/invalid/.test(error?.message||'')?'invalid_response':'unavailable'); retryable = ![400,401,403,404,413,429].includes(error?.status)&&!['disabled','cohort_expired','selftest_expired'].includes(failureReason);
          throw Error('candidate_request_failed');
        } finally { if (g === generation) controller = null; }
      },
      markExposed(g) {
        if (!current(g) || status !== 'ready') return false;
        exposed = true; offered = candidates.slice(); return true;
      },
      continueManually() { close(); candidates = []; },
      beginStructuring() { if (phase !== 'reading') throw Error('invalid_phase'); close(); phase = 'structuring'; },
      beginMainIdea(graph, structureType) {
        if (phase !== 'structuring' || !snapshot) throw Error('invalid_phase');
        contract.graph(graph, {structureType, sentences:snapshot.sentences, candidateIds:offered}); phase = 'mainIdea';
      },
      canRetry() { return !closed && phase==='reading' && status==='failed' && retryable && attempts<2; },
      resumeStructuring() { if(phase!=='mainIdea')throw Error('invalid_phase');phase='structuring'; },
      revisit() { if(phase==='retell')phase='mainIdea'; },
      beginRetell() { if (!['structuring','mainIdea'].includes(phase)) throw Error('invalid_phase'); close(); phase = 'retell'; },
      visibleCandidates() { return exposed && ['reading','structuring','mainIdea'].includes(phase) && snapshot ? snapshot.sentences.filter(s => candidates.includes(s.id)).map(s => ({...s})) : []; },
      state() { return {mode, phase, status, attempts, candidateExposure:exposed, candidateIds:offered.slice(), requestClosed:closed,failureReason}; },
      dispose() { close(); phase = 'ended'; snapshot = null; candidates = []; offered = []; exposed = false; accountId = null; }
    };
  }
  return {create, createEditor};
})();
if (typeof module !== 'undefined') module.exports = ReadingSupport;
