import { useState, useCallback, useMemo, useRef } from 'react';
import './ArchIconSearch.css';

/* ═══════════════════════════════════════════════
   Architecture Icon Database
   Cloud providers, DevOps tools, infra components
   Each icon is an inline SVG path for zero-dependency rendering
   ═══════════════════════════════════════════════ */

const ICON_CATEGORIES = [
  { id: 'aws', label: 'AWS', color: '#ff9900' },
  { id: 'gcp', label: 'GCP', color: '#4285f4' },
  { id: 'azure', label: 'Azure', color: '#0078d4' },
  { id: 'k8s', label: 'Kubernetes', color: '#326ce5' },
  { id: 'devops', label: 'DevOps', color: '#f97316' },
  { id: 'database', label: 'Database', color: '#10b981' },
  { id: 'monitoring', label: 'Monitoring', color: '#ec4899' },
  { id: 'network', label: 'Network', color: '#06b6d4' },
  { id: 'general', label: 'General', color: '#8b5cf6' },
];

// Simplified arch icons — SVG viewBox="0 0 64 64"
const ARCH_ICONS = [
  // ── AWS ──
  { id: 'aws-ec2', name: 'EC2', category: 'aws', tags: ['compute', 'instance', 'server', 'virtual machine'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#FF9900" opacity="0.15" stroke="#FF9900" stroke-width="2"/><text x="32" y="28" text-anchor="middle" fill="#FF9900" font-size="10" font-weight="700" font-family="sans-serif">EC2</text><rect x="18" y="33" width="28" height="14" rx="2" fill="none" stroke="#FF9900" stroke-width="1.5"/><line x1="25" y1="33" x2="25" y2="47" stroke="#FF9900" stroke-width="1"/><line x1="32" y1="33" x2="32" y2="47" stroke="#FF9900" stroke-width="1"/><line x1="39" y1="33" x2="39" y2="47" stroke="#FF9900" stroke-width="1"/>` },
  { id: 'aws-s3', name: 'S3', category: 'aws', tags: ['storage', 'bucket', 'object'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#3F8624" opacity="0.15" stroke="#3F8624" stroke-width="2"/><text x="32" y="28" text-anchor="middle" fill="#3F8624" font-size="10" font-weight="700" font-family="sans-serif">S3</text><ellipse cx="32" cy="40" rx="14" ry="5" fill="none" stroke="#3F8624" stroke-width="1.5"/><path d="M18 37v6" stroke="#3F8624" stroke-width="1.5"/><path d="M46 37v6" stroke="#3F8624" stroke-width="1.5"/><ellipse cx="32" cy="37" rx="14" ry="5" fill="none" stroke="#3F8624" stroke-width="1.5"/>` },
  { id: 'aws-rds', name: 'RDS', category: 'aws', tags: ['database', 'relational', 'mysql', 'postgres'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#3B48CC" opacity="0.15" stroke="#3B48CC" stroke-width="2"/><text x="32" y="26" text-anchor="middle" fill="#3B48CC" font-size="10" font-weight="700" font-family="sans-serif">RDS</text><ellipse cx="32" cy="34" rx="13" ry="4" fill="none" stroke="#3B48CC" stroke-width="1.5"/><path d="M19 34v10c0 2.2 5.8 4 13 4s13-1.8 13-4V34" fill="none" stroke="#3B48CC" stroke-width="1.5"/><path d="M19 39c0 2.2 5.8 4 13 4s13-1.8 13-4" fill="none" stroke="#3B48CC" stroke-width="1"/>` },
  { id: 'aws-lambda', name: 'Lambda', category: 'aws', tags: ['serverless', 'function', 'faas'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#FF9900" opacity="0.15" stroke="#FF9900" stroke-width="2"/><text x="32" y="26" text-anchor="middle" fill="#FF9900" font-size="8" font-weight="700" font-family="sans-serif">Lambda</text><text x="32" y="46" text-anchor="middle" fill="#FF9900" font-size="20" font-weight="300" font-family="sans-serif">λ</text>` },
  { id: 'aws-vpc', name: 'VPC', category: 'aws', tags: ['network', 'virtual private cloud'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#8C4FFF" opacity="0.12" stroke="#8C4FFF" stroke-width="2"/><text x="32" y="28" text-anchor="middle" fill="#8C4FFF" font-size="10" font-weight="700" font-family="sans-serif">VPC</text><rect x="16" y="33" width="32" height="16" rx="3" fill="none" stroke="#8C4FFF" stroke-width="1.5" stroke-dasharray="3,2"/>` },
  { id: 'aws-elb', name: 'ELB / ALB', category: 'aws', tags: ['load balancer', 'alb', 'nlb'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#8C4FFF" opacity="0.12" stroke="#8C4FFF" stroke-width="2"/><text x="32" y="25" text-anchor="middle" fill="#8C4FFF" font-size="9" font-weight="700" font-family="sans-serif">ELB</text><circle cx="32" cy="38" r="3" fill="#8C4FFF"/><line x1="32" y1="35" x2="20" y2="30" stroke="#8C4FFF" stroke-width="1.5"/><line x1="32" y1="35" x2="44" y2="30" stroke="#8C4FFF" stroke-width="1.5"/><line x1="32" y1="41" x2="20" y2="48" stroke="#8C4FFF" stroke-width="1.5"/><line x1="32" y1="41" x2="44" y2="48" stroke="#8C4FFF" stroke-width="1.5"/>` },
  { id: 'aws-cloudfront', name: 'CloudFront', category: 'aws', tags: ['cdn', 'distribution', 'edge'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#8C4FFF" opacity="0.12" stroke="#8C4FFF" stroke-width="2"/><text x="32" y="25" text-anchor="middle" fill="#8C4FFF" font-size="7" font-weight="700" font-family="sans-serif">CloudFront</text><circle cx="32" cy="40" r="10" fill="none" stroke="#8C4FFF" stroke-width="1.5"/><ellipse cx="32" cy="40" rx="10" ry="4" fill="none" stroke="#8C4FFF" stroke-width="1"/><line x1="32" y1="30" x2="32" y2="50" stroke="#8C4FFF" stroke-width="1"/>` },
  { id: 'aws-iam', name: 'IAM', category: 'aws', tags: ['identity', 'access', 'role', 'policy'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#DD344C" opacity="0.12" stroke="#DD344C" stroke-width="2"/><text x="32" y="25" text-anchor="middle" fill="#DD344C" font-size="10" font-weight="700" font-family="sans-serif">IAM</text><circle cx="32" cy="36" r="4" fill="none" stroke="#DD344C" stroke-width="1.5"/><path d="M24 48c0-4.4 3.6-8 8-8s8 3.6 8 8" fill="none" stroke="#DD344C" stroke-width="1.5"/>` },
  { id: 'aws-route53', name: 'Route 53', category: 'aws', tags: ['dns', 'domain', 'routing'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#8C4FFF" opacity="0.12" stroke="#8C4FFF" stroke-width="2"/><text x="32" y="25" text-anchor="middle" fill="#8C4FFF" font-size="7" font-weight="700" font-family="sans-serif">Route 53</text><text x="32" y="46" text-anchor="middle" fill="#8C4FFF" font-size="14" font-weight="700" font-family="sans-serif">53</text>` },
  { id: 'aws-ecs', name: 'ECS', category: 'aws', tags: ['container', 'docker', 'fargate'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#FF9900" opacity="0.15" stroke="#FF9900" stroke-width="2"/><text x="32" y="26" text-anchor="middle" fill="#FF9900" font-size="10" font-weight="700" font-family="sans-serif">ECS</text><rect x="18" y="31" width="12" height="10" rx="2" fill="none" stroke="#FF9900" stroke-width="1.2"/><rect x="34" y="31" width="12" height="10" rx="2" fill="none" stroke="#FF9900" stroke-width="1.2"/><rect x="26" y="43" width="12" height="8" rx="2" fill="none" stroke="#FF9900" stroke-width="1.2"/>` },
  { id: 'aws-eks', name: 'EKS', category: 'aws', tags: ['kubernetes', 'k8s', 'container'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#FF9900" opacity="0.15" stroke="#FF9900" stroke-width="2"/><text x="32" y="26" text-anchor="middle" fill="#FF9900" font-size="10" font-weight="700" font-family="sans-serif">EKS</text><polygon points="32,32 40,36 40,44 32,48 24,44 24,36" fill="none" stroke="#FF9900" stroke-width="1.5"/><circle cx="32" cy="40" r="3" fill="#FF9900" opacity="0.3"/>` },
  { id: 'aws-sqs', name: 'SQS', category: 'aws', tags: ['queue', 'messaging'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#FF4F8B" opacity="0.12" stroke="#FF4F8B" stroke-width="2"/><text x="32" y="26" text-anchor="middle" fill="#FF4F8B" font-size="10" font-weight="700" font-family="sans-serif">SQS</text><rect x="16" y="33" width="32" height="6" rx="2" fill="none" stroke="#FF4F8B" stroke-width="1.2"/><rect x="16" y="41" width="32" height="6" rx="2" fill="none" stroke="#FF4F8B" stroke-width="1.2"/>` },
  { id: 'aws-sns', name: 'SNS', category: 'aws', tags: ['notification', 'pub/sub', 'messaging'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#FF4F8B" opacity="0.12" stroke="#FF4F8B" stroke-width="2"/><text x="32" y="26" text-anchor="middle" fill="#FF4F8B" font-size="10" font-weight="700" font-family="sans-serif">SNS</text><circle cx="32" cy="41" r="7" fill="none" stroke="#FF4F8B" stroke-width="1.5"/><path d="M28 38l4 3 4-3" fill="none" stroke="#FF4F8B" stroke-width="1.2"/>` },
  { id: 'aws-dynamodb', name: 'DynamoDB', category: 'aws', tags: ['nosql', 'database', 'key-value'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#3B48CC" opacity="0.12" stroke="#3B48CC" stroke-width="2"/><text x="32" y="25" text-anchor="middle" fill="#3B48CC" font-size="7" font-weight="700" font-family="sans-serif">DynamoDB</text><path d="M20 32l12-4 12 4-12 4z" fill="none" stroke="#3B48CC" stroke-width="1.5"/><path d="M20 32v10l12 4 12-4V32" fill="none" stroke="#3B48CC" stroke-width="1.5"/>` },

  // ── GCP ──
  { id: 'gcp-gce', name: 'Compute Engine', category: 'gcp', tags: ['compute', 'vm', 'instance'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#4285F4" opacity="0.12" stroke="#4285F4" stroke-width="2"/><text x="32" y="26" text-anchor="middle" fill="#4285F4" font-size="7" font-weight="700" font-family="sans-serif">Compute</text><rect x="20" y="32" width="24" height="16" rx="2" fill="none" stroke="#4285F4" stroke-width="1.5"/><circle cx="27" cy="40" r="2" fill="#4285F4"/><line x1="32" y1="34" x2="32" y2="46" stroke="#4285F4" stroke-width="1"/>` },
  { id: 'gcp-gcs', name: 'Cloud Storage', category: 'gcp', tags: ['storage', 'bucket', 'object'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#4285F4" opacity="0.12" stroke="#4285F4" stroke-width="2"/><text x="32" y="25" text-anchor="middle" fill="#4285F4" font-size="7" font-weight="700" font-family="sans-serif">Storage</text><ellipse cx="32" cy="36" rx="14" ry="5" fill="none" stroke="#4285F4" stroke-width="1.5"/><path d="M18 36v8c0 2.8 6.3 5 14 5s14-2.2 14-5v-8" fill="none" stroke="#4285F4" stroke-width="1.5"/>` },
  { id: 'gcp-gke', name: 'GKE', category: 'gcp', tags: ['kubernetes', 'k8s', 'container'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#4285F4" opacity="0.12" stroke="#4285F4" stroke-width="2"/><text x="32" y="25" text-anchor="middle" fill="#4285F4" font-size="9" font-weight="700" font-family="sans-serif">GKE</text><polygon points="32,30 42,36 42,46 32,52 22,46 22,36" fill="none" stroke="#4285F4" stroke-width="1.5" transform="translate(0,-4)"/><circle cx="32" cy="38" r="3" fill="#4285F4" opacity="0.3"/>` },
  { id: 'gcp-cloudsql', name: 'Cloud SQL', category: 'gcp', tags: ['database', 'sql', 'mysql', 'postgres'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#4285F4" opacity="0.12" stroke="#4285F4" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#4285F4" font-size="7" font-weight="700" font-family="sans-serif">Cloud SQL</text><ellipse cx="32" cy="33" rx="12" ry="4" fill="none" stroke="#4285F4" stroke-width="1.5"/><path d="M20 33v12c0 2.2 5.4 4 12 4s12-1.8 12-4V33" fill="none" stroke="#4285F4" stroke-width="1.5"/>` },
  { id: 'gcp-functions', name: 'Cloud Functions', category: 'gcp', tags: ['serverless', 'function', 'faas'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#4285F4" opacity="0.12" stroke="#4285F4" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#4285F4" font-size="6" font-weight="700" font-family="sans-serif">Functions</text><text x="32" y="45" text-anchor="middle" fill="#4285F4" font-size="18" font-weight="300" font-family="sans-serif">ƒ</text>` },
  { id: 'gcp-pubsub', name: 'Pub/Sub', category: 'gcp', tags: ['messaging', 'queue', 'event'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#4285F4" opacity="0.12" stroke="#4285F4" stroke-width="2"/><text x="32" y="25" text-anchor="middle" fill="#4285F4" font-size="7" font-weight="700" font-family="sans-serif">Pub/Sub</text><circle cx="24" cy="40" r="4" fill="none" stroke="#4285F4" stroke-width="1.5"/><circle cx="40" cy="34" r="4" fill="none" stroke="#4285F4" stroke-width="1.5"/><circle cx="40" cy="46" r="4" fill="none" stroke="#4285F4" stroke-width="1.5"/><line x1="28" y1="39" x2="36" y2="35" stroke="#4285F4" stroke-width="1.2"/><line x1="28" y1="41" x2="36" y2="45" stroke="#4285F4" stroke-width="1.2"/>` },

  // ── Azure ──
  { id: 'azure-vm', name: 'Virtual Machine', category: 'azure', tags: ['compute', 'vm', 'instance'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#0078D4" opacity="0.12" stroke="#0078D4" stroke-width="2"/><text x="32" y="25" text-anchor="middle" fill="#0078D4" font-size="8" font-weight="700" font-family="sans-serif">VM</text><rect x="18" y="30" width="28" height="18" rx="2" fill="none" stroke="#0078D4" stroke-width="1.5"/><line x1="24" y1="44" x2="40" y2="44" stroke="#0078D4" stroke-width="1.5"/><rect x="28" y="48" width="8" height="2" rx="1" fill="#0078D4" opacity="0.4"/>` },
  { id: 'azure-aks', name: 'AKS', category: 'azure', tags: ['kubernetes', 'k8s', 'container'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#0078D4" opacity="0.12" stroke="#0078D4" stroke-width="2"/><text x="32" y="25" text-anchor="middle" fill="#0078D4" font-size="9" font-weight="700" font-family="sans-serif">AKS</text><polygon points="32,30 42,36 42,46 32,52 22,46 22,36" fill="none" stroke="#0078D4" stroke-width="1.5" transform="translate(0,-4)"/><circle cx="32" cy="38" r="3" fill="#0078D4" opacity="0.3"/>` },
  { id: 'azure-blob', name: 'Blob Storage', category: 'azure', tags: ['storage', 'blob', 'object'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#0078D4" opacity="0.12" stroke="#0078D4" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#0078D4" font-size="7" font-weight="700" font-family="sans-serif">Blob</text><ellipse cx="32" cy="36" rx="14" ry="5" fill="none" stroke="#0078D4" stroke-width="1.5"/><path d="M18 36v8c0 2.8 6.3 5 14 5s14-2.2 14-5v-8" fill="none" stroke="#0078D4" stroke-width="1.5"/>` },
  { id: 'azure-sqldb', name: 'SQL Database', category: 'azure', tags: ['database', 'sql', 'relational'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#0078D4" opacity="0.12" stroke="#0078D4" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#0078D4" font-size="7" font-weight="700" font-family="sans-serif">SQL DB</text><ellipse cx="32" cy="33" rx="12" ry="4" fill="none" stroke="#0078D4" stroke-width="1.5"/><path d="M20 33v12c0 2.2 5.4 4 12 4s12-1.8 12-4V33" fill="none" stroke="#0078D4" stroke-width="1.5"/>` },
  { id: 'azure-functions', name: 'Azure Functions', category: 'azure', tags: ['serverless', 'function', 'faas'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#0078D4" opacity="0.12" stroke="#0078D4" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#0078D4" font-size="6" font-weight="700" font-family="sans-serif">Functions</text><path d="M22 44l8-14h4l-8 14z" fill="none" stroke="#0078D4" stroke-width="1.5"/><path d="M30 30l8 14h4l-8-14z" fill="none" stroke="#0078D4" stroke-width="1.5"/>` },
  { id: 'azure-appgw', name: 'App Gateway', category: 'azure', tags: ['load balancer', 'gateway', 'waf'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#0078D4" opacity="0.12" stroke="#0078D4" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#0078D4" font-size="6" font-weight="700" font-family="sans-serif">App GW</text><circle cx="32" cy="40" r="8" fill="none" stroke="#0078D4" stroke-width="1.5"/><path d="M26 40h12M32 34v12" stroke="#0078D4" stroke-width="1.2"/>` },

  // ── Kubernetes ──
  { id: 'k8s-pod', name: 'Pod', category: 'k8s', tags: ['container', 'workload'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#326CE5" opacity="0.12" stroke="#326CE5" stroke-width="2"/><text x="32" y="25" text-anchor="middle" fill="#326CE5" font-size="10" font-weight="700" font-family="sans-serif">Pod</text><rect x="20" y="30" width="24" height="18" rx="3" fill="none" stroke="#326CE5" stroke-width="1.5"/><circle cx="28" cy="39" r="3" fill="#326CE5" opacity="0.3"/><circle cx="36" cy="39" r="3" fill="#326CE5" opacity="0.3"/>` },
  { id: 'k8s-deploy', name: 'Deployment', category: 'k8s', tags: ['workload', 'replica', 'rollout'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#326CE5" opacity="0.12" stroke="#326CE5" stroke-width="2"/><text x="32" y="23" text-anchor="middle" fill="#326CE5" font-size="7" font-weight="700" font-family="sans-serif">Deploy</text><rect x="16" y="28" width="16" height="10" rx="2" fill="none" stroke="#326CE5" stroke-width="1.2"/><rect x="20" y="31" width="16" height="10" rx="2" fill="none" stroke="#326CE5" stroke-width="1.2"/><rect x="24" y="34" width="16" height="10" rx="2" fill="none" stroke="#326CE5" stroke-width="1.2"/><rect x="28" y="37" width="16" height="10" rx="2" fill="none" stroke="#326CE5" stroke-width="1.5"/>` },
  { id: 'k8s-service', name: 'Service', category: 'k8s', tags: ['network', 'load balancer', 'clusterip'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#326CE5" opacity="0.12" stroke="#326CE5" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#326CE5" font-size="8" font-weight="700" font-family="sans-serif">Service</text><circle cx="32" cy="40" r="9" fill="none" stroke="#326CE5" stroke-width="1.5"/><polygon points="32,34 36,42 28,42" fill="#326CE5" opacity="0.3"/>` },
  { id: 'k8s-ingress', name: 'Ingress', category: 'k8s', tags: ['network', 'routing', 'http'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#326CE5" opacity="0.12" stroke="#326CE5" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#326CE5" font-size="8" font-weight="700" font-family="sans-serif">Ingress</text><path d="M16 40h32" stroke="#326CE5" stroke-width="1.5"/><path d="M32 30v20" stroke="#326CE5" stroke-width="1.5"/><polygon points="32,28 36,34 28,34" fill="#326CE5" opacity="0.4"/>` },
  { id: 'k8s-configmap', name: 'ConfigMap', category: 'k8s', tags: ['config', 'configuration', 'env'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#326CE5" opacity="0.12" stroke="#326CE5" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#326CE5" font-size="6" font-weight="700" font-family="sans-serif">ConfigMap</text><rect x="18" y="29" width="28" height="20" rx="2" fill="none" stroke="#326CE5" stroke-width="1.5"/><line x1="22" y1="35" x2="42" y2="35" stroke="#326CE5" stroke-width="1"/><line x1="22" y1="39" x2="38" y2="39" stroke="#326CE5" stroke-width="1"/><line x1="22" y1="43" x2="35" y2="43" stroke="#326CE5" stroke-width="1"/>` },
  { id: 'k8s-secret', name: 'Secret', category: 'k8s', tags: ['secret', 'credential', 'password'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#326CE5" opacity="0.12" stroke="#326CE5" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#326CE5" font-size="8" font-weight="700" font-family="sans-serif">Secret</text><circle cx="32" cy="38" r="5" fill="none" stroke="#326CE5" stroke-width="1.5"/><rect x="28" y="42" width="8" height="8" rx="1" fill="none" stroke="#326CE5" stroke-width="1.5"/><circle cx="32" cy="38" r="2" fill="#326CE5"/>` },
  { id: 'k8s-pv', name: 'PersistentVolume', category: 'k8s', tags: ['storage', 'volume', 'pv', 'pvc'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#326CE5" opacity="0.12" stroke="#326CE5" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#326CE5" font-size="9" font-weight="700" font-family="sans-serif">PV</text><path d="M18 30h28l-4 22H22z" fill="none" stroke="#326CE5" stroke-width="1.5"/>` },
  { id: 'k8s-ns', name: 'Namespace', category: 'k8s', tags: ['namespace', 'isolation', 'scope'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#326CE5" opacity="0.12" stroke="#326CE5" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#326CE5" font-size="7" font-weight="700" font-family="sans-serif">Namespace</text><rect x="14" y="28" width="36" height="22" rx="3" fill="none" stroke="#326CE5" stroke-width="1.5" stroke-dasharray="4,2"/>` },
  { id: 'k8s-hpa', name: 'HPA', category: 'k8s', tags: ['autoscaler', 'horizontal', 'scaling'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#326CE5" opacity="0.12" stroke="#326CE5" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#326CE5" font-size="9" font-weight="700" font-family="sans-serif">HPA</text><path d="M18 40h8M30 40h4M38 40h8" stroke="#326CE5" stroke-width="2"/><path d="M22 36l-4 4 4 4M42 36l4 4-4 4" fill="none" stroke="#326CE5" stroke-width="1.5"/>` },

  // ── DevOps ──
  { id: 'devops-docker', name: 'Docker', category: 'devops', tags: ['container', 'image', 'dockerfile'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#2496ED" opacity="0.12" stroke="#2496ED" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#2496ED" font-size="7" font-weight="700" font-family="sans-serif">Docker</text><rect x="16" y="36" width="32" height="12" rx="3" fill="none" stroke="#2496ED" stroke-width="1.5"/><rect x="18" y="30" width="6" height="5" rx="1" fill="none" stroke="#2496ED" stroke-width="1"/><rect x="26" y="30" width="6" height="5" rx="1" fill="none" stroke="#2496ED" stroke-width="1"/><rect x="34" y="30" width="6" height="5" rx="1" fill="none" stroke="#2496ED" stroke-width="1"/>` },
  { id: 'devops-terraform', name: 'Terraform', category: 'devops', tags: ['iac', 'infrastructure', 'hcl'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#7B42BC" opacity="0.12" stroke="#7B42BC" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#7B42BC" font-size="6" font-weight="700" font-family="sans-serif">Terraform</text><rect x="18" y="30" width="10" height="8" fill="#7B42BC" opacity="0.5"/><rect x="30" y="30" width="10" height="8" fill="#7B42BC" opacity="0.5"/><rect x="24" y="40" width="10" height="8" fill="#7B42BC" opacity="0.5"/>` },
  { id: 'devops-ansible', name: 'Ansible', category: 'devops', tags: ['automation', 'configuration', 'playbook'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#EE0000" opacity="0.1" stroke="#EE0000" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#EE0000" font-size="7" font-weight="700" font-family="sans-serif">Ansible</text><circle cx="32" cy="40" r="10" fill="none" stroke="#EE0000" stroke-width="1.5"/><text x="32" y="44" text-anchor="middle" fill="#EE0000" font-size="12" font-weight="700" font-family="sans-serif">A</text>` },
  { id: 'devops-jenkins', name: 'Jenkins', category: 'devops', tags: ['ci', 'cd', 'pipeline', 'build'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#D24939" opacity="0.12" stroke="#D24939" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#D24939" font-size="7" font-weight="700" font-family="sans-serif">Jenkins</text><circle cx="32" cy="40" r="9" fill="none" stroke="#D24939" stroke-width="1.5"/><text x="32" y="44" text-anchor="middle" fill="#D24939" font-size="12" font-weight="700" font-family="sans-serif">J</text>` },
  { id: 'devops-github', name: 'GitHub Actions', category: 'devops', tags: ['ci', 'cd', 'workflow', 'git'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#333" opacity="0.15" stroke="#e2e8f0" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#e2e8f0" font-size="6" font-weight="700" font-family="sans-serif">GitHub</text><circle cx="32" cy="40" r="9" fill="none" stroke="#e2e8f0" stroke-width="1.5"/><circle cx="32" cy="38" r="3" fill="#e2e8f0" opacity="0.3"/><path d="M26 46c0-3.3 2.7-6 6-6s6 2.7 6 6" fill="none" stroke="#e2e8f0" stroke-width="1.2"/>` },
  { id: 'devops-gitlab', name: 'GitLab CI', category: 'devops', tags: ['ci', 'cd', 'pipeline', 'git'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#FC6D26" opacity="0.12" stroke="#FC6D26" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#FC6D26" font-size="7" font-weight="700" font-family="sans-serif">GitLab</text><polygon points="32,30 44,48 20,48" fill="none" stroke="#FC6D26" stroke-width="1.5"/>` },
  { id: 'devops-argocd', name: 'ArgoCD', category: 'devops', tags: ['gitops', 'cd', 'deploy', 'kubernetes'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#EF7B4D" opacity="0.12" stroke="#EF7B4D" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#EF7B4D" font-size="7" font-weight="700" font-family="sans-serif">ArgoCD</text><circle cx="32" cy="40" r="9" fill="none" stroke="#EF7B4D" stroke-width="1.5"/><path d="M26 40l4 4 8-8" fill="none" stroke="#EF7B4D" stroke-width="2"/>` },
  { id: 'devops-helm', name: 'Helm', category: 'devops', tags: ['kubernetes', 'chart', 'package'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#0F1689" opacity="0.15" stroke="#277A9F" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#277A9F" font-size="8" font-weight="700" font-family="sans-serif">Helm</text><circle cx="32" cy="40" r="9" fill="none" stroke="#277A9F" stroke-width="1.5"/><path d="M25 40h14M32 33v14" stroke="#277A9F" stroke-width="1.5"/>` },

  // ── Database ──
  { id: 'db-postgres', name: 'PostgreSQL', category: 'database', tags: ['sql', 'relational', 'rdb'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#336791" opacity="0.12" stroke="#336791" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#336791" font-size="6" font-weight="700" font-family="sans-serif">PostgreSQL</text><ellipse cx="32" cy="33" rx="12" ry="4" fill="none" stroke="#336791" stroke-width="1.5"/><path d="M20 33v12c0 2.2 5.4 4 12 4s12-1.8 12-4V33" fill="none" stroke="#336791" stroke-width="1.5"/><path d="M20 38c0 2.2 5.4 4 12 4s12-1.8 12-4" fill="none" stroke="#336791" stroke-width="1"/>` },
  { id: 'db-mysql', name: 'MySQL', category: 'database', tags: ['sql', 'relational', 'rdb'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#4479A1" opacity="0.12" stroke="#4479A1" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#4479A1" font-size="7" font-weight="700" font-family="sans-serif">MySQL</text><ellipse cx="32" cy="33" rx="12" ry="4" fill="none" stroke="#4479A1" stroke-width="1.5"/><path d="M20 33v12c0 2.2 5.4 4 12 4s12-1.8 12-4V33" fill="none" stroke="#4479A1" stroke-width="1.5"/>` },
  { id: 'db-redis', name: 'Redis', category: 'database', tags: ['cache', 'key-value', 'in-memory'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#DC382D" opacity="0.12" stroke="#DC382D" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#DC382D" font-size="8" font-weight="700" font-family="sans-serif">Redis</text><path d="M18 36l14-6 14 6-14 6z" fill="none" stroke="#DC382D" stroke-width="1.5"/><path d="M18 36v8l14 6 14-6v-8" fill="none" stroke="#DC382D" stroke-width="1.5"/>` },
  { id: 'db-mongodb', name: 'MongoDB', category: 'database', tags: ['nosql', 'document', 'json'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#47A248" opacity="0.12" stroke="#47A248" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#47A248" font-size="6" font-weight="700" font-family="sans-serif">MongoDB</text><path d="M32 30c-5 0-10 4-10 10s5 10 10 10 10-4 10-10-5-10-10-10z" fill="none" stroke="#47A248" stroke-width="1.5"/><line x1="32" y1="30" x2="32" y2="50" stroke="#47A248" stroke-width="1.5"/>` },
  { id: 'db-elastic', name: 'Elasticsearch', category: 'database', tags: ['search', 'log', 'elk', 'index'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#FEC514" opacity="0.12" stroke="#00BFB3" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#00BFB3" font-size="5" font-weight="700" font-family="sans-serif">Elastic</text><circle cx="32" cy="40" r="10" fill="none" stroke="#00BFB3" stroke-width="1.5"/><path d="M22 40h20" stroke="#FEC514" stroke-width="2"/>` },

  // ── Monitoring ──
  { id: 'mon-prometheus', name: 'Prometheus', category: 'monitoring', tags: ['metrics', 'alerting', 'tsdb'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#E6522C" opacity="0.12" stroke="#E6522C" stroke-width="2"/><text x="32" y="22" text-anchor="middle" fill="#E6522C" font-size="5" font-weight="700" font-family="sans-serif">Prometheus</text><circle cx="32" cy="38" r="10" fill="none" stroke="#E6522C" stroke-width="1.5"/><path d="M24 44h16M26 38h12" stroke="#E6522C" stroke-width="1.5"/><path d="M32 28v4" stroke="#E6522C" stroke-width="2"/>` },
  { id: 'mon-grafana', name: 'Grafana', category: 'monitoring', tags: ['dashboard', 'visualization', 'metrics'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#F46800" opacity="0.12" stroke="#F46800" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#F46800" font-size="7" font-weight="700" font-family="sans-serif">Grafana</text><rect x="16" y="30" width="32" height="18" rx="2" fill="none" stroke="#F46800" stroke-width="1.5"/><polyline points="20,44 26,36 30,40 36,32 42,38" fill="none" stroke="#F46800" stroke-width="1.5"/>` },
  { id: 'mon-loki', name: 'Loki', category: 'monitoring', tags: ['log', 'logging', 'grafana'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#F46800" opacity="0.12" stroke="#F46800" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#F46800" font-size="9" font-weight="700" font-family="sans-serif">Loki</text><rect x="18" y="30" width="28" height="18" rx="2" fill="none" stroke="#F46800" stroke-width="1.5"/><line x1="22" y1="36" x2="42" y2="36" stroke="#F46800" stroke-width="1" opacity="0.5"/><line x1="22" y1="40" x2="38" y2="40" stroke="#F46800" stroke-width="1" opacity="0.5"/><line x1="22" y1="44" x2="34" y2="44" stroke="#F46800" stroke-width="1" opacity="0.5"/>` },
  { id: 'mon-alertmanager', name: 'Alertmanager', category: 'monitoring', tags: ['alert', 'notification', 'prometheus'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#E6522C" opacity="0.12" stroke="#E6522C" stroke-width="2"/><text x="32" y="22" text-anchor="middle" fill="#E6522C" font-size="5" font-weight="700" font-family="sans-serif">AlertMgr</text><path d="M24 44l8-16 8 16z" fill="none" stroke="#E6522C" stroke-width="1.5"/><line x1="32" y1="34" x2="32" y2="40" stroke="#E6522C" stroke-width="1.5"/><circle cx="32" cy="42" r="1" fill="#E6522C"/>` },

  // ── Network ──
  { id: 'net-nginx', name: 'Nginx', category: 'network', tags: ['web server', 'reverse proxy', 'load balancer'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#009639" opacity="0.12" stroke="#009639" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#009639" font-size="8" font-weight="700" font-family="sans-serif">Nginx</text><polygon points="32,30 46,48 18,48" fill="none" stroke="#009639" stroke-width="1.5"/>` },
  { id: 'net-traefik', name: 'Traefik', category: 'network', tags: ['reverse proxy', 'ingress', 'load balancer'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#24A1C1" opacity="0.12" stroke="#24A1C1" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#24A1C1" font-size="7" font-weight="700" font-family="sans-serif">Traefik</text><circle cx="32" cy="40" r="9" fill="none" stroke="#24A1C1" stroke-width="1.5"/><path d="M26 40h12M32 34v12" stroke="#24A1C1" stroke-width="1.5"/>` },
  { id: 'net-istio', name: 'Istio', category: 'network', tags: ['service mesh', 'sidecar', 'envoy'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#466BB0" opacity="0.12" stroke="#466BB0" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#466BB0" font-size="9" font-weight="700" font-family="sans-serif">Istio</text><path d="M32 30l-10 18h20z" fill="none" stroke="#466BB0" stroke-width="1.5"/>` },
  { id: 'net-vault', name: 'Vault', category: 'network', tags: ['secret', 'security', 'hashicorp'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#FFD814" opacity="0.08" stroke="#FFD814" stroke-width="2"/><text x="32" y="24" text-anchor="middle" fill="#FFD814" font-size="8" font-weight="700" font-family="sans-serif">Vault</text><polygon points="32,28 44,36 44,46 32,52 20,46 20,36" fill="none" stroke="#FFD814" stroke-width="1.5"/><circle cx="32" cy="40" r="3" fill="#FFD814" opacity="0.4"/>` },

  // ── General ──
  { id: 'gen-server', name: 'Server', category: 'general', tags: ['compute', 'host', 'machine'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#8b5cf6" opacity="0.1" stroke="#8b5cf6" stroke-width="2"/><rect x="16" y="16" width="32" height="12" rx="2" fill="none" stroke="#8b5cf6" stroke-width="1.5"/><circle cx="22" cy="22" r="2" fill="#8b5cf6" opacity="0.4"/><rect x="16" y="32" width="32" height="12" rx="2" fill="none" stroke="#8b5cf6" stroke-width="1.5"/><circle cx="22" cy="38" r="2" fill="#8b5cf6" opacity="0.4"/><line x1="28" y1="22" x2="42" y2="22" stroke="#8b5cf6" stroke-width="1"/><line x1="28" y1="38" x2="42" y2="38" stroke="#8b5cf6" stroke-width="1"/>` },
  { id: 'gen-database', name: 'Database', category: 'general', tags: ['db', 'storage', 'data'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#8b5cf6" opacity="0.1" stroke="#8b5cf6" stroke-width="2"/><ellipse cx="32" cy="20" rx="14" ry="5" fill="none" stroke="#8b5cf6" stroke-width="1.5"/><path d="M18 20v24c0 2.8 6.3 5 14 5s14-2.2 14-5V20" fill="none" stroke="#8b5cf6" stroke-width="1.5"/><path d="M18 28c0 2.8 6.3 5 14 5s14-2.2 14-5" fill="none" stroke="#8b5cf6" stroke-width="1"/><path d="M18 36c0 2.8 6.3 5 14 5s14-2.2 14-5" fill="none" stroke="#8b5cf6" stroke-width="1"/>` },
  { id: 'gen-user', name: 'User', category: 'general', tags: ['person', 'client', 'actor'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#8b5cf6" opacity="0.1" stroke="#8b5cf6" stroke-width="2"/><circle cx="32" cy="26" r="7" fill="none" stroke="#8b5cf6" stroke-width="1.5"/><path d="M18 50c0-7.7 6.3-14 14-14s14 6.3 14 14" fill="none" stroke="#8b5cf6" stroke-width="1.5"/>` },
  { id: 'gen-cloud', name: 'Cloud', category: 'general', tags: ['provider', 'internet', 'saas'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#8b5cf6" opacity="0.1" stroke="#8b5cf6" stroke-width="2"/><path d="M16 38c0-5.5 4.5-10 10-10 .8-4.8 5-8.5 10-8.5 5.5 0 10 4.5 10 10 3 0 5.5 2.5 5.5 5.5s-2.5 5.5-5.5 5.5H20c-3 0-5-2.5-4-5.5z" fill="none" stroke="#8b5cf6" stroke-width="1.5"/>` },
  { id: 'gen-internet', name: 'Internet', category: 'general', tags: ['web', 'globe', 'world'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#8b5cf6" opacity="0.1" stroke="#8b5cf6" stroke-width="2"/><circle cx="32" cy="32" r="14" fill="none" stroke="#8b5cf6" stroke-width="1.5"/><ellipse cx="32" cy="32" rx="6" ry="14" fill="none" stroke="#8b5cf6" stroke-width="1"/><line x1="18" y1="32" x2="46" y2="32" stroke="#8b5cf6" stroke-width="1"/><path d="M20 24c3.5 1.5 7.5 2.5 12 2.5s8.5-1 12-2.5" fill="none" stroke="#8b5cf6" stroke-width="1"/><path d="M20 40c3.5-1.5 7.5-2.5 12-2.5s8.5 1 12 2.5" fill="none" stroke="#8b5cf6" stroke-width="1"/>` },
  { id: 'gen-firewall', name: 'Firewall', category: 'general', tags: ['security', 'waf', 'protection'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#ef4444" opacity="0.1" stroke="#ef4444" stroke-width="2"/><rect x="14" y="14" width="36" height="36" rx="3" fill="none" stroke="#ef4444" stroke-width="1.5"/><line x1="14" y1="26" x2="50" y2="26" stroke="#ef4444" stroke-width="1.2"/><line x1="14" y1="38" x2="50" y2="38" stroke="#ef4444" stroke-width="1.2"/><line x1="26" y1="14" x2="26" y2="50" stroke="#ef4444" stroke-width="1.2"/><line x1="38" y1="14" x2="38" y2="50" stroke="#ef4444" stroke-width="1.2"/>` },
  { id: 'gen-queue', name: 'Message Queue', category: 'general', tags: ['mq', 'messaging', 'broker', 'kafka', 'rabbitmq'],
    svg: `<rect x="8" y="8" width="48" height="48" rx="4" fill="#8b5cf6" opacity="0.1" stroke="#8b5cf6" stroke-width="2"/><text x="32" y="22" text-anchor="middle" fill="#8b5cf6" font-size="6" font-weight="700" font-family="sans-serif">Queue</text><rect x="14" y="28" width="10" height="6" rx="1" fill="none" stroke="#8b5cf6" stroke-width="1.2"/><rect x="27" y="28" width="10" height="6" rx="1" fill="none" stroke="#8b5cf6" stroke-width="1.2"/><rect x="40" y="28" width="10" height="6" rx="1" fill="none" stroke="#8b5cf6" stroke-width="1.2"/><path d="M24 31h3M37 31h3" stroke="#8b5cf6" stroke-width="1.5"/><path d="M18 38v6l6-3zM32 38v6l6-3zM46 38v6l-6-3z" fill="none" stroke="#8b5cf6" stroke-width="1"/>` },
];

/* ═══════════════════════════════════════════════
   SVG generation for download
   ═══════════════════════════════════════════════ */
function buildSvgString(icon, size = 64) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${size}" height="${size}">${icon.svg}</svg>`;
}

function downloadSvg(icon) {
  const svgStr = buildSvgString(icon, 256);
  const blob = new Blob([svgStr], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${icon.id}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadPng(icon, size = 256) {
  const svgStr = buildSvgString(icon, size);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = new Image();
  const blob = new Blob([svgStr], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  img.onload = () => {
    ctx.drawImage(img, 0, 0, size, size);
    URL.revokeObjectURL(url);
    canvas.toBlob((pngBlob) => {
      const pngUrl = URL.createObjectURL(pngBlob);
      const a = document.createElement('a');
      a.href = pngUrl;
      a.download = `${icon.id}.png`;
      a.click();
      URL.revokeObjectURL(pngUrl);
    });
  };
  img.src = url;
}

/* ═══════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════ */
export default function ArchIconSearch({ isOpen, onClose }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [selectedIcon, setSelectedIcon] = useState(null);
  const [viewSize, setViewSize] = useState('md'); // sm | md | lg
  const [copiedSvg, setCopiedSvg] = useState(false);
  const searchRef = useRef(null);

  const filteredIcons = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return ARCH_ICONS.filter(icon => {
      const matchCat = filterCategory === 'all' || icon.category === filterCategory;
      if (!matchCat) return false;
      if (!q) return true;
      return (
        icon.name.toLowerCase().includes(q) ||
        icon.id.toLowerCase().includes(q) ||
        icon.category.toLowerCase().includes(q) ||
        icon.tags.some(t => t.toLowerCase().includes(q))
      );
    });
  }, [searchQuery, filterCategory]);

  const categoryCount = useMemo(() => {
    const counts = { all: ARCH_ICONS.length };
    ARCH_ICONS.forEach(i => {
      counts[i.category] = (counts[i.category] || 0) + 1;
    });
    return counts;
  }, []);

  const handleCopySvg = useCallback((icon) => {
    const svgStr = buildSvgString(icon, 256);
    navigator.clipboard.writeText(svgStr).then(() => {
      setCopiedSvg(true);
      setTimeout(() => setCopiedSvg(false), 1500);
    });
  }, []);

  const sizeMap = { sm: 48, md: 72, lg: 96 };

  if (!isOpen) return null;

  return (
    <div className="archi-overlay" onClick={onClose}>
      <div className="archi-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="archi-header">
          <div className="archi-title-row">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            <h2>Architecture Icon Search</h2>
            <span className="archi-badge">{ARCH_ICONS.length} icons</span>
          </div>
          <button className="archi-close" onClick={onClose}>✕</button>
        </div>

        <div className="archi-body">
          {/* Sidebar */}
          <div className="archi-sidebar">
            {/* Search */}
            <div className="archi-search-wrap">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                ref={searchRef}
                className="archi-search-input"
                placeholder="Search icons, tags..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="archi-search-clear" onClick={() => setSearchQuery('')}>✕</button>
              )}
            </div>

            {/* Category filter */}
            <div className="archi-cat-list">
              <button
                className={`archi-cat-btn ${filterCategory === 'all' ? 'active' : ''}`}
                onClick={() => setFilterCategory('all')}
              >
                <span className="archi-cat-dot" style={{ background: '#94a3b8' }} />
                All
                <span className="archi-cat-count">{categoryCount.all}</span>
              </button>
              {ICON_CATEGORIES.map(cat => (
                <button
                  key={cat.id}
                  className={`archi-cat-btn ${filterCategory === cat.id ? 'active' : ''}`}
                  onClick={() => setFilterCategory(cat.id)}
                >
                  <span className="archi-cat-dot" style={{ background: cat.color }} />
                  {cat.label}
                  <span className="archi-cat-count">{categoryCount[cat.id] || 0}</span>
                </button>
              ))}
            </div>

            {/* Size toggle */}
            <div className="archi-size-toggle">
              <span className="archi-size-label">Size</span>
              <div className="archi-size-btns">
                {[['sm', 'S'], ['md', 'M'], ['lg', 'L']].map(([v, l]) => (
                  <button key={v} className={`archi-size-btn ${viewSize === v ? 'active' : ''}`} onClick={() => setViewSize(v)}>
                    {l}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected icon detail */}
            {selectedIcon && (
              <div className="archi-detail">
                <div className="archi-detail-preview" dangerouslySetInnerHTML={{ __html: buildSvgString(selectedIcon, 120) }} />
                <div className="archi-detail-info">
                  <span className="archi-detail-name">{selectedIcon.name}</span>
                  <span className="archi-detail-cat">
                    {ICON_CATEGORIES.find(c => c.id === selectedIcon.category)?.label || selectedIcon.category}
                  </span>
                  <div className="archi-detail-tags">
                    {selectedIcon.tags.map((t, i) => (
                      <span key={i} className="archi-detail-tag" onClick={() => setSearchQuery(t)}>{t}</span>
                    ))}
                  </div>
                </div>
                <div className="archi-detail-actions">
                  <button className="archi-dl-btn svg" onClick={() => downloadSvg(selectedIcon)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    SVG
                  </button>
                  <button className="archi-dl-btn png" onClick={() => downloadPng(selectedIcon, 256)}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    PNG
                  </button>
                  <button className={`archi-dl-btn copy ${copiedSvg ? 'copied' : ''}`} onClick={() => handleCopySvg(selectedIcon)}>
                    {copiedSvg ? '✓' : 'Copy SVG'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Main grid */}
          <div className="archi-main">
            <div className="archi-grid-header">
              <span className="archi-result-count">{filteredIcons.length} icons</span>
              {searchQuery && <span className="archi-search-tag">"{searchQuery}"</span>}
            </div>

            {filteredIcons.length === 0 ? (
              <div className="archi-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.2">
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
                </svg>
                <p>No icons found</p>
              </div>
            ) : (
              <div className={`archi-grid archi-grid-${viewSize}`}>
                {filteredIcons.map(icon => {
                  const cat = ICON_CATEGORIES.find(c => c.id === icon.category);
                  const isSelected = selectedIcon?.id === icon.id;
                  return (
                    <button
                      key={icon.id}
                      className={`archi-icon-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => setSelectedIcon(isSelected ? null : icon)}
                      title={`${icon.name} (${cat?.label || icon.category})`}
                    >
                      <div
                        className="archi-icon-svg"
                        dangerouslySetInnerHTML={{ __html: buildSvgString(icon, sizeMap[viewSize]) }}
                      />
                      <span className="archi-icon-name">{icon.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
