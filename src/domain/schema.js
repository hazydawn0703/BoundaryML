/**
 * BoundaryML unified domain object contract (JSDoc typedefs).
 * All generators, state, validation and UI should follow these structures.
 */

/** @typedef {'human_only'|'ai_draft_human_review'|'human_lead_ai_assist'|'ai_execute_human_approval'|'ai_autonomous'} ExecutionMode */
/** @typedef {'low'|'medium'|'high'} RiskLevel */
/** @typedef {'missing'|'draft'|'reviewed'|'validated'|'final'|'applied'|'rejected'|'outdated'|'failed_validation'|'invalid'} Status */

/**
 * @typedef {Object} ReviewGate
 * @property {string} id
 * @property {string} name
 * @property {string} reviewerRole
 * @property {string[]} criteria
 * @property {string} passCondition
 * @property {string} rejectCondition
 * @property {boolean} allowAiRevision
 * @property {boolean} required
 */

/**
 * @typedef {Object} ArtifactContract
 * @property {string} id
 * @property {string} format
 * @property {string} outputFormat
 * @property {string[]} acceptanceCriteria
 */

/**
 * @typedef {Object} Node
 * @property {string} id
 * @property {string} phaseId
 * @property {string} name
 * @property {string} goal
 * @property {ExecutionMode} executionMode
 * @property {RiskLevel} riskLevel
 * @property {Status} status
 * @property {string} humanOwnerRole
 * @property {string} aiRole
 * @property {string[]} inputs
 * @property {string[]} outputs
 * @property {ArtifactContract} artifactContract
 * @property {ReviewGate|null} reviewGate
 * @property {Status} promptStatus
 * @property {Status} checklistStatus
 * @property {{at:string, action:string}[]} history
 */

/** @typedef {{id:string,name:string,order:number}} Phase */
/** @typedef {{id:string,from:string,to:string}} Edge */

/** @typedef {{id:string,nodeId:string,phaseId:string,name:string,model:string,status:Status,outputFormat:string,acceptanceCriteria:string[],content:string,updatedAt:string,outdatedReason?:string}} PromptAsset */
/** @typedef {{id:string,nodeId:string,phaseId:string,name:string,status:Status,reviewerRole:string,items:string[],updatedAt:string,outdatedReason?:string}} ChecklistAsset */
/** @typedef {{id:string,nodeId:string,name:string,content:string,status:Status}} ArtifactTemplate */

/** @typedef {{id:string,version:number,status:Status,phases:Phase[],nodes:Node[],edges:Edge[],updatedAt:string,templateType?:string}} Workflow */

/** @typedef {{teamRoles:string[],approvalProcess:string[],toolStack:string[],riskConstraints:string[],historicalProcessMaterials:string,summary?:Object|null}} ContextPack */

/** @typedef {{id:string,level:'error'|'warning'|'suggestion',targetType:'workflow'|'node'|'prompt'|'checklist'|'edge',targetId:string,title:string,message:string,suggestedAction?:string,autoFixAvailable?:boolean,blockingFinal?:boolean}} ValidationResult */

/** @typedef {{id:string,type:'added'|'updated'|'removed',targetType:string,targetId:string,field:string,before:any,after:any,reason:string,impact:string,selected:boolean}} DiffChange */
/** @typedef {{id:string,request:string,changes:DiffChange[],warnings:string[],createdAt:string}} WorkflowDiff */

/** @typedef {{id:string,status:'draft_only'|'final_ready'|'stale',canExportFinal:boolean,generatedAt:string,snapshotVersion:number,files:Object,blockingErrors:number}} ExecutionKit */

/** @typedef {{id:string,name:string,type:string,goal:string,currentStage:string,riskLevel:RiskLevel,workflowStatus:Status,deliveryScope:string[],expectedAiScope:string[],sensitiveAreas:string[],setupMode:string,contextPack:ContextPack,workflow:Workflow,assets:{prompts:PromptAsset[],checklists:ChecklistAsset[],artifactTemplates:ArtifactTemplate[]},executionKit:ExecutionKit|null}} Project */

export const SCHEMA_VERSION = 'boundaryml-schema-v1';
