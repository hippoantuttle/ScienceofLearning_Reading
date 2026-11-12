'use strict';
var ReadingSupportContract = (() => {
  const source = typeof module !== 'undefined' ? require('./sentence-source.js') : SentenceSource;
  const exact = (v, keys) => !!v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).sort().join('|') === [...keys].sort().join('|');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const relations = {claim:{type:'supports',from:'support',to:'primary'},cause:{type:'causes',from:'primary',to:'support'},problem:{type:'addresses',from:'support',to:'primary'}};
  function candidateIds(value, sentences) {
    if (!exact(value, ['candidateIds']) || !Array.isArray(value.candidateIds) || sentences.length < 2) throw Error('invalid_candidates');
    const ids = value.candidateIds, min = sentences.length === 2 ? 2 : 3;
    if (ids.length < min || ids.length > Math.min(5, sentences.length) || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !sentences.some(s => s.id === id))) throw Error('invalid_candidates');
    // Ordering is always by source position, never by model ranking.
    return sentences.filter(s => ids.includes(s.id)).map(s => s.id);
  }
  function request(value) {
    if (!exact(value, ['schemaVersion','requestId','segmentationVersion','article']) || value.schemaVersion !== 1 || typeof value.requestId !== 'string' || !uuid.test(value.requestId) || value.segmentationVersion !== source.VERSION || new TextEncoder().encode(JSON.stringify(value)).length > 50000) throw Error('invalid_request');
    const snapshot = source.segment(value.article);
    if (snapshot.sentences.length < 2) throw Error('unsupported_source');
    return snapshot;
  }
  function response(value, {requestId, documentHash, sentences}) {
    if (!exact(value, ['kind','schemaVersion','requestId','documentHash','segmentationVersion','promptVersion','modelId','candidateIds']) || value.kind !== 'reading-candidates' || value.schemaVersion !== 1 || value.requestId !== requestId || !uuid.test(requestId) || value.documentHash !== documentHash || !/^sha256:[a-f0-9]{64}$/.test(documentHash) || value.segmentationVersion !== source.VERSION || value.promptVersion !== 'reading-candidates-v1' || typeof value.modelId !== 'string' || !/^[a-zA-Z0-9._:/-]{1,100}$/.test(value.modelId)) throw Error('invalid_response');
    return candidateIds({candidateIds:value.candidateIds}, sentences);
  }
  function graph(value, {structureType, sentences, candidateIds: candidates = []}) {
    const relation = relations[structureType];
    if (!relation || !exact(value, ['nodes','edges']) || !Array.isArray(value.nodes) || value.nodes.length < 2 || value.nodes.length > 8 || !Array.isArray(value.edges) || value.edges.length < 1 || value.edges.length > 16) throw Error('invalid_graph');
    const nodes = value.nodes, ids = nodes.map(n => n?.id);
    if (new Set(ids).size !== ids.length || new Set(nodes.map(n => n?.sentenceId)).size !== nodes.length) throw Error('invalid_graph');
    for (const n of nodes) {
      const original = sentences.find(s => s.id === n?.sentenceId);
      if (!exact(n, ['id','sentenceId','text','role','source','order']) || typeof n.id !== 'string' || !/^n[0-9]{1,4}$/.test(n.id) || !original || n.text !== original.text || !['primary','support'].includes(n.role) || n.source !== (candidates.includes(n.sentenceId) ? 'ai_candidate' : 'learner_added') || !Number.isInteger(n.order) || n.order < 0 || n.order >= nodes.length) throw Error('invalid_graph');
    }
    if (new Set(nodes.map(n => n.order)).size !== nodes.length || !nodes.some(n => n.role === 'primary') || !nodes.some(n => n.role === 'support')) throw Error('invalid_graph');
    const connected = new Set(), pairs = new Set();
    for (const edge of value.edges) {
      const from = nodes.find(n => n.id === edge?.from), to = nodes.find(n => n.id === edge?.to);
      if (!exact(edge, ['from','to','relationType']) || !from || !to || from.id === to.id || from.role !== relation.from || to.role !== relation.to || edge.relationType !== relation.type || pairs.has(edge.from + ':' + edge.to)) throw Error('invalid_graph');
      pairs.add(edge.from + ':' + edge.to); connected.add(from.id); connected.add(to.id);
    }
    if (nodes.some(n => !connected.has(n.id))) throw Error('invalid_graph');
    return structuredClone(value);
  }
  function textFields(value, context) {
    const valid = graph(value, context), ordered = valid.nodes.sort((a,b) => a.order - b.order);
    const fields = Object.fromEntries(['primary','support'].map(role => [role, ordered.filter(n => n.role === role).map(n => n.text).join('\n')]));
    if (Object.values(fields).some(s => Array.from(s).length > 10000)) throw Error('graph_text_too_large');
    return fields;
  }
  return {exact, relations, candidateIds, request, response, graph, textFields};
})();
if (typeof module !== 'undefined') module.exports = ReadingSupportContract;
