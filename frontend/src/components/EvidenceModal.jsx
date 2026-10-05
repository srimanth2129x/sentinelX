import React, { useState } from 'react'
import { X, GitBranch, Terminal } from 'lucide-react'

export default function EvidenceModal({ alert, onClose }) {
  const [selectedNode, setSelectedNode] = useState(null)

  if (!alert) return null
  const graph = alert.evidence_graph || { nodes: [], edges: [] }

  const getNodeColor = (type) => {
    switch (type) {
      case 'entity':
        return 'border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
      case 'event':
        return 'border-amber-400 dark:border-amber-500 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300'
      case 'mutation':
        return 'border-purple-400 dark:border-purple-500 bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300'
      case 'mitre':
        return 'border-amber-500 dark:border-amber-500 bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-300 font-bold'
      case 'risk':
        return 'border-orange-500 dark:border-orange-500 bg-orange-50 dark:bg-orange-950/50 text-orange-800 dark:text-orange-300 font-bold'
      case 'alert':
        return 'border-red-500 dark:border-red-500 bg-red-50 dark:bg-red-950/60 text-red-800 dark:text-red-300 font-bold'
      default:
        return 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 dark:bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white dark:bg-surface-base border border-slate-200/90 dark:border-border-base rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden theme-transition">
        
        {/* Modal Header */}
        <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase tracking-wider bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800/60">
                {alert.severity || 'HIGH'}
              </span>
              <h2 className="text-base font-bold font-mono text-slate-900 dark:text-slate-100 tracking-tight">
                {alert.title}
              </h2>
            </div>
            <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
              Device: <span className="font-semibold text-slate-800 dark:text-slate-200">{alert.device_id}</span>
              {alert.created_at && (
                <> · Generated: <span className="text-slate-600 dark:text-slate-300">{new Date(alert.created_at).toLocaleTimeString()}</span></>
              )}
            </p>
          </div>

          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Close Evidence Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* MITRE ATT&CK Header Ribbon */}
        {alert.mitre_technique_id && (
          <div className="bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-500/20 p-3 px-6 flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-3">
              <span className="font-bold text-amber-700 dark:text-amber-400 text-sm">{alert.mitre_technique_id}</span>
              <span className="text-slate-800 dark:text-slate-200 font-semibold">{alert.mitre_technique_name}</span>
              {alert.mitre_tactic && (
                <span className="px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30">
                  Tactic: {alert.mitre_tactic}
                </span>
              )}
            </div>
            <span className="text-slate-500 dark:text-slate-400 italic text-[11px] hidden sm:inline">
              Observed pattern consistent with ATT&CK
            </span>
          </div>
        )}

        {/* Split Body: Graph Canvas & Node Inspector */}
        <div className="grid grid-cols-1 md:grid-cols-3 flex-1 overflow-hidden">
          
          {/* Graph Sequence Panel */}
          <div className="md:col-span-2 p-6 bg-slate-50/70 dark:bg-slate-950/40 border-r border-slate-200 dark:border-slate-800 overflow-y-auto flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <GitBranch className="w-4 h-4 text-slate-500" />
                <span className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
                  Explainability Sequence Chain (Click Node)
                </span>
              </div>
              
              <div className="flex flex-wrap items-center justify-center gap-3 py-6">
                {graph.nodes && graph.nodes.map((node, i) => (
                  <div key={node.id} className="flex items-center">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedNode(node)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setSelectedNode(node)
                        }
                      }}
                      className={`cursor-pointer border rounded-xl p-3 min-w-[140px] text-center shadow-sm transition transform hover:scale-105 ${getNodeColor(node.type)} ${
                        selectedNode?.id === node.id ? 'ring-2 ring-slate-800 dark:ring-white scale-105' : ''
                      }`}
                    >
                      <div className="text-[10px] uppercase tracking-wider opacity-75 mb-1 font-mono">{node.label}</div>
                      <div className="text-xs font-semibold truncate max-w-[150px]">{node.name}</div>
                    </div>
                    {i < graph.nodes.length - 1 && (
                      <span className="text-slate-400 dark:text-slate-600 font-mono px-2 text-sm font-bold">➔</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Edge Inferences */}
            <div className="border-t border-slate-200 dark:border-slate-800/80 pt-3 mt-4">
              <span className="text-[11px] font-mono text-slate-500 uppercase tracking-wider font-semibold">
                Causal / Correlation Edges:
              </span>
              <div className="flex flex-wrap gap-2 mt-2">
                {graph.edges && graph.edges.map((e, idx) => (
                  <span key={idx} className="text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 px-2 py-1 rounded font-mono">
                    {e.source.split(':')[0]} ➔ <span className="font-semibold text-slate-900 dark:text-slate-100">{e.relationship}</span> ➔ {e.target.split(':')[0]}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Node Detail Inspector */}
          <div className="p-4 bg-white dark:bg-surface-base overflow-y-auto">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold">
              Node Evidence Inspector
            </span>
            {selectedNode ? (
              <div className="mt-4 space-y-3 font-mono text-xs">
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 dark:text-slate-500 block text-[10px]">NODE TYPE</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{selectedNode.label}</span>
                </div>
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 dark:text-slate-500 block text-[10px]">IDENTIFIER / NAME</span>
                  <span className="text-slate-800 dark:text-slate-200 break-all">{selectedNode.name}</span>
                </div>
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <span className="text-slate-400 dark:text-slate-500 block text-[10px]">EVIDENCE DETAILS</span>
                  <pre className="text-[11px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap mt-1 overflow-x-auto">
                    {JSON.stringify(selectedNode.details, null, 2)}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center text-xs text-slate-400 dark:text-slate-500 p-6 space-y-2">
                <Terminal className="w-6 h-6 text-slate-400" />
                <p>Click any node in the explainability sequence chain to inspect timestamps, commands, or telemetry properties.</p>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  )
}