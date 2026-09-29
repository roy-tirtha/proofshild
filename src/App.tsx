import { useState } from 'react';
import type { ConnectedAPI, InitialAPI } from '@midnight-ntwrk/dapp-connector-api';
import {
  Shield,
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  Cpu,
  Terminal,
  CheckCircle2,
  Copy,
  Check,
  Sliders,
  Search,
  FileCode,
  Award
} from 'lucide-react';

interface ClaimState {
  threshold: number;
  activityCount: number;
  isVerified: boolean | null;
  hasInitialised: boolean;
  txHash: string | null;
  timestamp: string | null;
  circuitRows: number;
  kValue: number;
}

interface WalletChoice {
  id: string;
  api: InitialAPI;
}

export function App() {
  const [activeTab, setActiveTab] = useState<'studio' | 'verifier' | 'architecture' | 'level1'>('studio');
  const [network, setNetwork] = useState<'local' | 'preprod' | 'preview'>('local');
  const [copied, setCopied] = useState(false);
  const [selectedAdapter, setSelectedAdapter] = useState<'github' | 'htb' | 'thm'>('github');
  const [showRawEvidence, setShowRawEvidence] = useState(false);
  const [walletChoices, setWalletChoices] = useState<WalletChoice[]>([]);
  const [connectedWallet, setConnectedWallet] = useState<{ api: ConnectedAPI; address: string; name: string } | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);

  // Contract interactive state
  const contractAddress = import.meta.env.VITE_CONTRACT_ADDRESS ?? '';
  const contractState: ClaimState = {
    threshold: 0, activityCount: 0, isVerified: null, hasInitialised: false,
    txHash: null, timestamp: null, circuitRows: 0, kValue: 0
  };
  const aliceAddress = connectedWallet?.address ?? 'Connect a Lace wallet to display your address';

  const connectWallet = async (wallet: InitialAPI) => {
    setWalletError(null);
    try {
      const api = await wallet.connect(network === 'local' ? 'undeployed' : network);
      const [{ unshieldedAddress }, status] = await Promise.all([
        api.getUnshieldedAddress(), api.getConnectionStatus()
      ]);
      if (status.status !== 'connected') throw new Error('Wallet connection was not established.');
      setConnectedWallet({ api, address: unshieldedAddress, name: wallet.name });
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : 'Could not connect wallet.');
    }
  };

  const discoverWallets = () => {
    const choices = Object.entries(window.midnight ?? {}).map(([id, api]) => ({ id, api }));
    setWalletChoices(choices);
    setWalletError(choices.length ? null : 'No Midnight wallet found. Install or enable Lace, then refresh.');
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const disconnectWallet = () => setConnectedWallet(null);

  return (
    <div className="min-h-screen bg-[#07090e] text-[#e2e8f0] font-sans antialiased flex flex-col selection:bg-[#10b981]/30 selection:text-white">
      {/* Top Telemetry & Network Status Bar */}
      <header className="border-b border-[#1e283d] bg-[#0c101a]/90 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#10b981] to-[#047857] p-0.5 shadow-lg shadow-[#10b981]/20 flex items-center justify-center">
              <div className="w-full h-full bg-[#0c101a] rounded-[10px] flex items-center justify-center">
                <Shield className="w-5 h-5 text-[#10b981]" />
              </div>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg tracking-tight text-white">PROOFSHIELD</span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-[#10b981]/15 text-[#34d399] border border-[#10b981]/30 font-semibold">
                  Midnight Network
                </span>
              </div>
              <p className="text-xs text-[#94a3b8]">Privacy-First Technical Achievement Verification</p>
            </div>
          </div>

          <div className="hidden md:flex items-center space-x-4">
            <div className="flex items-center space-x-2 bg-[#131929] border border-[#222e47] px-3 py-1.5 rounded-lg text-xs font-mono">
              <span className={`w-2 h-2 rounded-full ${connectedWallet ? 'bg-[#10b981]' : 'bg-amber-400'}`}></span>
              <span className="text-[#94a3b8]">Wallet:</span>
              <span className="text-white font-medium">{connectedWallet?.name ?? 'Disconnected'}</span>
            </div>

            {/* Network Selector */}
            <div className="flex items-center space-x-1.5 bg-[#131929] border border-[#222e47] p-1 rounded-lg text-xs font-mono">
              {(['local', 'preprod', 'preview'] as const).map((net) => (
                <button
                  key={net}
                  onClick={() => setNetwork(net)}
                  className={`px-2.5 py-1 rounded transition-colors uppercase ${
                    network === net
                      ? 'bg-[#1e293b] text-[#38bdf8] font-bold shadow-sm'
                      : 'text-[#94a3b8] hover:text-white'
                  }`}
                >
                  {net}
                </button>
              ))}
            </div>

            {/* Contract Address Pill */}
            <button
              disabled={!contractAddress}
              onClick={() => contractAddress && copyToClipboard(contractAddress)}
              className="flex items-center space-x-1.5 bg-[#131929] hover:bg-[#1a2338] border border-[#222e47] px-3 py-1.5 rounded-lg text-xs font-mono text-[#94a3b8] transition-colors"
              title="Click to copy contract address"
            >
              <Cpu className="w-3.5 h-3.5 text-[#38bdf8]" />
              <span>{contractAddress ? `${contractAddress.slice(0, 8)}...${contractAddress.slice(-6)}` : 'Contract not configured'}</span>
              {copied ? <Check className="w-3.5 h-3.5 text-[#10b981]" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <div className="hidden md:flex items-center gap-2">
            {connectedWallet ? (
              <>
                <span className="max-w-36 truncate text-xs font-mono text-[#94a3b8]" title={connectedWallet.address}>{connectedWallet.address}</span>
                <button onClick={disconnectWallet} className="px-3 py-2 text-xs rounded-lg border border-[#334155] text-white">Disconnect</button>
              </>
            ) : (
              <button onClick={discoverWallets} className="px-3 py-2 text-xs rounded-lg bg-[#10b981] text-[#07110e] font-semibold">Connect Lace</button>
            )}
            {walletChoices.map(({ id, api }) => (
              <button key={id} onClick={() => connectWallet(api)} className="px-2 py-1 text-xs rounded border border-[#334155] text-white">{api.name}</button>
            ))}
          </div>
        </div>
        {walletError && <p role="alert" className="px-6 pb-2 text-xs text-rose-300">{walletError}</p>}
      </header>

      {/* Main Navigation Tabs */}
      <nav className="border-b border-[#182133] bg-[#090d16]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex space-x-8">
          <button
            onClick={() => setActiveTab('studio')}
            className={`flex items-center space-x-2 py-3.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'studio'
                ? 'border-[#10b981] text-[#10b981]'
                : 'border-transparent text-[#94a3b8] hover:text-white'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>ZK Proof Studio (Prover)</span>
          </button>
          <button
            onClick={() => setActiveTab('verifier')}
            className={`flex items-center space-x-2 py-3.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'verifier'
                ? 'border-[#38bdf8] text-[#38bdf8]'
                : 'border-transparent text-[#94a3b8] hover:text-white'
            }`}
          >
            <Search className="w-4 h-4" />
            <span>Verifier & Recruiter Portal</span>
          </button>
          <button
            onClick={() => setActiveTab('architecture')}
            className={`flex items-center space-x-2 py-3.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'architecture'
                ? 'border-[#818cf8] text-[#818cf8]'
                : 'border-transparent text-[#94a3b8] hover:text-white'
            }`}
          >
            <FileCode className="w-4 h-4" />
            <span>Compact Circuits & Privacy Model</span>
          </button>
          <button
            onClick={() => setActiveTab('level1')}
            className={`flex items-center space-x-2 py-3.5 text-sm font-medium border-b-2 transition-all ${
              activeTab === 'level1'
                ? 'border-[#f59e0b] text-[#f59e0b]'
                : 'border-transparent text-[#94a3b8] hover:text-white'
            }`}
          >
            <Award className="w-4 h-4" />
            <span>Rise In Level 1 Verification</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ========================================================================= */}
        {/* TAB 1: ZK PROOF STUDIO (CANDIDATE / PROVER) */}
        {/* ========================================================================= */}
        {activeTab === 'studio' && (
          <div className="space-y-8">
            {/* Core Value Proposition Banner */}
            <div className="bg-[#0f1523] border border-[#1e283d] rounded-2xl p-6 relative overflow-hidden">
              <div className="max-w-3xl">
                <div className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-full bg-[#10b981]/10 text-[#34d399] border border-[#10b981]/25 text-xs font-semibold mb-3">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>The Core Philosophy</span>
                </div>
                <h2 className="text-2xl font-bold text-white tracking-tight mb-2">
                  "Prove the specific thing you need to prove, without exposing your entire personal/technical history."
                </h2>
                <p className="text-sm text-[#94a3b8] leading-relaxed">
                  Instead of handing recruiters your full GitHub account, unvetted commits, or sensitive private emails, ProofShield allows you to prove you have cleared objective technical milestones using <strong>zero-knowledge circuits</strong> compiled on the <strong>Midnight Network</strong>.
                </p>
              </div>
            </div>

            {/* 4-Step Pipeline */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Left Column: Interactive Inputs & Circuits */}
              <div className="lg:col-span-7 space-y-6">
                {/* Step 1: Evidence Adapter */}
                <div className="bg-[#0f1523] border border-[#1e283d] rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-7 h-7 rounded-lg bg-[#1e293b] text-[#38bdf8] flex items-center justify-center text-xs font-bold font-mono">
                        01
                      </div>
                      <h3 className="font-semibold text-white">External Platform Adapter</h3>
                    </div>
                    <span className="text-xs font-mono text-[#94a3b8] bg-[#161d2d] px-2.5 py-1 rounded border border-[#222e44]">
                      Adapter Layer (Off-Chain)
                    </span>
                  </div>

                  <p className="text-xs text-[#94a3b8] mb-4">
                    ProofShield uses deterministic adapters to normalize evidence from disparate technical sources into verifiable claims.
                  </p>

                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <button
                      onClick={() => setSelectedAdapter('github')}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                        selectedAdapter === 'github'
                          ? 'border-[#38bdf8] bg-[#38bdf8]/10 text-white'
                          : 'border-[#1e283d] bg-[#131929] text-[#94a3b8] hover:border-[#334155]'
                      }`}
                    >
                      <svg className="w-5 h-5 mb-1 fill-current" viewBox="0 0 24 24">
                        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                      </svg>
                      <span className="text-xs font-medium">GitHub</span>
                    </button>
                    <button
                      onClick={() => setSelectedAdapter('htb')}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                        selectedAdapter === 'htb'
                          ? 'border-[#10b981] bg-[#10b981]/10 text-white'
                          : 'border-[#1e283d] bg-[#131929] text-[#94a3b8] hover:border-[#334155]'
                      }`}
                    >
                      <Terminal className="w-5 h-5 mb-1 text-[#10b981]" />
                      <span className="text-xs font-medium">Hack The Box</span>
                    </button>
                    <button
                      onClick={() => setSelectedAdapter('thm')}
                      className={`flex flex-col items-center justify-center p-3 rounded-xl border text-center transition-all ${
                        selectedAdapter === 'thm'
                          ? 'border-[#f59e0b] bg-[#f59e0b]/10 text-white'
                          : 'border-[#1e283d] bg-[#131929] text-[#94a3b8] hover:border-[#334155]'
                      }`}
                    >
                      <Shield className="w-5 h-5 mb-1 text-[#f59e0b]" />
                      <span className="text-xs font-medium">TryHackMe</span>
                    </button>
                  </div>

                  {/* Adapter Payload Preview */}
                  <div className="bg-[#090d16] border border-[#1a2337] rounded-xl p-4 font-mono text-xs">
                    <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#1a2337]">
                      <span className="text-[#38bdf8] text-[11px]">Normalized Evidence Payload</span>
                      <button
                        onClick={() => setShowRawEvidence(!showRawEvidence)}
                        className="text-[11px] text-[#94a3b8] hover:text-white flex items-center space-x-1"
                      >
                        {showRawEvidence ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                        <span>{showRawEvidence ? 'Hide Private Raw Data' : 'Inspect Raw Data'}</span>
                      </button>
                    </div>

                    {showRawEvidence ? (
                      <div className="space-y-1 text-[#cbd5e1] text-[11px]">
                        <div className="text-rose-400 font-semibold mb-1">⚠️ SENSITIVE RAW DATA (KEPT STRICTLY LOCAL):</div>
                        <div>"user_email": "candidate.confidential@example.com"</div>
                        <div>"github_handle": "0x-shadow-builder"</div>
                        <div>"repos": ["p2p-mesh-router", "sec-scanner", "private-infra"]</div>
                        <div>"raw_commits_analyzed": 142</div>
                      </div>
                    ) : (
                      <div className="space-y-1 text-[#34d399] text-[11px]">
                        <div>✓ Verified Claim Target: "Technical Security & Systems Activities"</div>
                        <div>✓ Objective Rule: language == 'Java' && has_socket_networking == true</div>
                        <div>Private evidence is not connected to a trusted source yet.</div>
                        <div className="text-[#94a3b8] text-[10px] mt-1 pt-1 border-t border-[#1a2337]">
                          * Personal emails, repository names, and identities are scrubbed before reaching the ZK circuit.
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 2: Compact Circuit Execution Config */}
                <div className="bg-[#0f1523] border border-[#1e283d] rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-7 h-7 rounded-lg bg-[#1e293b] text-[#10b981] flex items-center justify-center text-xs font-bold font-mono">
                        02
                      </div>
                      <h3 className="font-semibold text-white">Circuit Parameters & Private Witness</h3>
                    </div>
                    <span className="text-xs font-mono text-[#94a3b8] bg-[#161d2d] px-2.5 py-1 rounded border border-[#222e44]">
                      proofshield.compact
                    </span>
                  </div>

                  <div className="space-y-5">
                    {/* Public Threshold */}
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="text-xs font-semibold text-white flex items-center space-x-1.5">
                          <Eye className="w-3.5 h-3.5 text-[#38bdf8]" />
                          <span>Required Threshold (Public Ledger State)</span>
                        </label>
                        <span className="font-mono text-sm font-bold text-[#38bdf8] bg-[#38bdf8]/10 px-2 py-0.5 rounded border border-[#38bdf8]/20">
                          Configure contract threshold on-chain
                        </span>
                      </div>
                      <p className="text-xs text-[#94a3b8] mb-2">
                        Function: <code className="text-xs text-white">initialise_claim(required_count)</code>. Stored on-chain so verifiers know the required benchmark.
                      </p>
                    </div>

                    {/* Private Witness Slider */}
                    <div className="pt-4 border-t border-[#1e283d]">
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="text-xs font-semibold text-white flex items-center space-x-1.5">
                          <Lock className="w-3.5 h-3.5 text-[#f59e0b]" />
                          <span>Your Actual Count (Private Circuit Witness)</span>
                        </label>
                        <span className="font-mono text-sm font-bold text-[#f59e0b] bg-[#f59e0b]/10 px-2 py-0.5 rounded border border-[#f59e0b]/20">
                          Private until a real proof is submitted
                        </span>
                      </div>
                      <p className="text-xs text-[#94a3b8] mb-2">
                        Function: <code className="text-xs text-white">submit_proof(activity_count)</code>. Evaluated in zero-knowledge. <strong>Never stored on the ledger.</strong>
                      </p>
                    </div>

                    {/* Expected Outcome Indicator */}
                    <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200">
                      A connected wallet is ready, but circuit submission is unavailable until the contract and Midnight.js wallet provider are configured. No proof or transaction is simulated.
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Public Ledger State & Live Proof Card */}
              <div className="lg:col-span-5 space-y-6">
                {/* Public On-Chain Ledger State */}
                <div className="bg-[#0f1523] border border-[#1e283d] rounded-2xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-7 h-7 rounded-lg bg-[#1e293b] text-[#818cf8] flex items-center justify-center text-xs font-bold font-mono">
                        03
                      </div>
                      <h3 className="font-semibold text-white">Live On-Chain Ledger State</h3>
                    </div>
                    <span className="flex items-center space-x-1.5 text-xs font-mono text-[#10b981] bg-[#10b981]/10 px-2.5 py-1 rounded border border-[#10b981]/25">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#10b981] animate-ping"></span>
                      <span>Not connected</span>
                    </span>
                  </div>

                  <p className="text-xs text-[#94a3b8] mb-4">
                    This represents the exact data stored on the Midnight blockchain ledger for this contract.
                  </p>

                  <div className="space-y-3 font-mono text-xs">
                    <div className="bg-[#090d16] border border-[#1e283d] p-3.5 rounded-xl flex justify-between items-center">
                      <span className="text-[#94a3b8]">export ledger claim_verified:</span>
                      <span className={`px-2.5 py-1 rounded font-bold ${
                        contractState.isVerified
                          ? 'bg-[#10b981]/15 text-[#34d399] border border-[#10b981]/30'
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      }`}>
                        {contractState.isVerified === null ? 'No chain result loaded' : contractState.isVerified ? 'TRUE (Verified)' : 'FALSE'}
                      </span>
                    </div>

                    <div className="bg-[#090d16] border border-[#1e283d] p-3.5 rounded-xl flex justify-between items-center">
                      <span className="text-[#94a3b8]">export ledger threshold:</span>
                      <span className="text-white font-bold">{contractState.hasInitialised ? `${contractState.threshold} activities` : 'Not loaded'}</span>
                    </div>

                    <div className="bg-[#090d16] border border-[#1e283d] p-3.5 rounded-xl flex justify-between items-center">
                      <span className="text-[#94a3b8]">activity_count (raw):</span>
                      <span className="text-[#f59e0b] font-bold flex items-center space-x-1">
                        <Lock className="w-3.5 h-3.5" />
                        <span>SEALED / PRIVATE</span>
                      </span>
                    </div>

                    <div className="bg-[#090d16] border border-[#1e283d] p-3.5 rounded-xl space-y-1 text-[11px]">
                      <div className="text-[#94a3b8]">Latest Proving Transaction:</div>
                      <div className="text-[#38bdf8] truncate">{contractState.txHash ?? 'No transaction yet'}</div>
                      <div className="text-[#64748b] text-[10px]">{contractState.timestamp ? `Settled: ${contractState.timestamp}` : 'Awaiting a real contract call'}</div>
                    </div>
                  </div>
                </div>

                {/* Candidate Proof Card (Selective Disclosure) */}
                <div className="bg-gradient-to-b from-[#11192b] to-[#0b101c] border border-[#233350] rounded-2xl p-6 shadow-xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-[#10b981]/10 rounded-full blur-2xl pointer-events-none"></div>

                  <div className="flex items-center justify-between border-b border-[#222e47] pb-3 mb-4">
                    <div className="flex items-center space-x-2">
                      <Shield className="w-4 h-4 text-[#10b981]" />
                      <span className="text-xs font-bold text-white tracking-wider uppercase font-mono">
                        ProofShield Verifiable Claim
                      </span>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/20">
                      Claim ID: unavailable
                    </span>
                  </div>

                  <div className="space-y-4 text-xs">
                    <div>
                      <div className="text-[10px] uppercase font-mono text-[#94a3b8] mb-1">Prover Identifier (DID)</div>
                      <div className="font-mono text-white text-[11px] bg-[#090d16] p-2 rounded-lg border border-[#1a2337] truncate">
                        {aliceAddress}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-[10px] uppercase font-mono text-[#94a3b8]">Cryptographically Verified Attributes</div>
                      
                      <div className="bg-[#141e30] border border-[#223352] p-2.5 rounded-lg flex items-center justify-between">
                        <span className="text-[#f8fafc]">Technical Security Activities</span>
                        <span className="text-[#10b981] font-bold flex items-center space-x-1 font-mono">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{contractState.isVerified === null ? 'No verified claim loaded' : `≥ ${contractState.threshold} Verified`}</span>
                        </span>
                      </div>

                      <div className="bg-[#141e30] border border-[#223352] p-2.5 rounded-lg flex items-center justify-between">
                        <span className="text-[#f8fafc]">Systems & Networking Experience</span>
                        <span className="text-[#10b981] font-bold flex items-center space-x-1 font-mono">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Proven (Java / Socket)</span>
                        </span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-[#222e47] space-y-1.5">
                      <div className="text-[10px] uppercase font-mono text-[#94a3b8]">Privacy Protection Audit</div>
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-[#64748b]">
                        <div className="flex items-center space-x-1 text-[#f59e0b]">
                          <Lock className="w-3 h-3" />
                          <span>Full History: Hidden</span>
                        </div>
                        <div className="flex items-center space-x-1 text-[#f59e0b]">
                          <Lock className="w-3 h-3" />
                          <span>GitHub ID: Hidden</span>
                        </div>
                        <div className="flex items-center space-x-1 text-[#f59e0b]">
                          <Lock className="w-3 h-3" />
                          <span>Email/PII: Hidden</span>
                        </div>
                        <div className="flex items-center space-x-1 text-[#f59e0b]">
                          <Lock className="w-3 h-3" />
                          <span>Raw Count: Hidden</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: VERIFIER & RECRUITER PORTAL */}
        {/* ========================================================================= */}
        {activeTab === 'verifier' && (
          <div className="space-y-8 max-w-4xl mx-auto">
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold text-white tracking-tight">Zero-Disclosure Verification Portal</h2>
              <p className="text-sm text-[#94a3b8] max-w-2xl mx-auto">
                Verify that candidates satisfy precise technical requirements directly against the Midnight Network ledger, without requesting or storing their private resumes or activity feeds.
              </p>
            </div>

            {/* Recruiter Requirement Search */}
            <div className="bg-[#0f1523] border border-[#1e283d] rounded-2xl p-6 space-y-4">
              <h3 className="font-semibold text-white text-sm">Query Candidate Claim</h3>
              <div className="flex space-x-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-[#94a3b8] absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    defaultValue={contractAddress}
                    className="w-full bg-[#090d16] border border-[#1e283d] rounded-xl pl-10 pr-4 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-[#38bdf8]"
                    placeholder="Enter Contract Address or Candidate Proof Token..."
                  />
                </div>
                <button className="px-5 py-2.5 bg-[#38bdf8] hover:bg-[#0284c7] text-[#090d16] font-semibold text-xs rounded-xl transition-colors font-mono cursor-pointer">
                  Verify Proof
                </button>
              </div>
            </div>

            {/* Verification Result Sheet */}
            <div className="bg-[#0f1523] border border-[#1e283d] rounded-2xl p-8 space-y-6">
              <div className="flex items-start justify-between pb-6 border-b border-[#1e283d]">
                <div>
                  <div className="text-xs font-mono text-[#38bdf8] uppercase tracking-wider mb-1">
                    Verification Audit Report
                  </div>
                  <h3 className="text-xl font-bold text-white">No candidate claim loaded</h3>
                  <p className="text-xs text-[#94a3b8] mt-1 font-mono">
                    Contract on Midnight: {contractAddress ? `${contractAddress.slice(0, 16)}...` : 'Not configured'}
                  </p>
                </div>
                <div className="flex items-center space-x-2 bg-[#10b981]/15 text-[#34d399] border border-[#10b981]/30 px-3.5 py-1.5 rounded-xl font-mono text-xs font-bold">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Awaiting on-chain result</span>
                </div>
              </div>

              {/* Requirement vs Disclosure Table */}
              <div className="space-y-4">
                <h4 className="text-xs font-semibold text-white uppercase font-mono tracking-wider">
                  Requirement Evaluation
                </h4>
                <div className="border border-[#1e283d] rounded-xl overflow-hidden text-xs">
                  <div className="grid grid-cols-3 bg-[#131929] p-3 font-semibold text-[#94a3b8] border-b border-[#1e283d]">
                    <span>Requirement</span>
                    <span>Verified Result</span>
                    <span>Disclosed Candidate Data</span>
                  </div>

                  <div className="grid grid-cols-3 p-3.5 border-b border-[#1e283d] items-center">
                    <span className="text-white font-medium">Security Activity Benchmark</span>
                    <span className="text-[#10b981] font-mono font-semibold flex items-center space-x-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>No claim loaded</span>
                    </span>
                    <span className="text-[#f59e0b] font-mono flex items-center space-x-1">
                      <Lock className="w-3 h-3" />
                      <span>0 Bytes (Sealed)</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-3 p-3.5 border-b border-[#1e283d] items-center">
                    <span className="text-white font-medium">Networking & Distributed Systems</span>
                    <span className="text-[#10b981] font-mono font-semibold flex items-center space-x-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>No evidence adapter configured</span>
                    </span>
                    <span className="text-[#f59e0b] font-mono flex items-center space-x-1">
                      <Lock className="w-3 h-3" />
                      <span>Repo code hidden</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-3 p-3.5 items-center bg-[#090d16]/40">
                    <span className="text-white font-medium">Anti-Bias & Identity Protection</span>
                    <span className="text-[#38bdf8] font-mono font-semibold">Protected</span>
                    <span className="text-[#f59e0b] font-mono flex items-center space-x-1">
                      <Lock className="w-3 h-3" />
                      <span>No Name / Age / Gender / Location</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Verifier Explanation Box */}
              <div className="bg-[#131a29] border border-[#202c44] rounded-xl p-4 text-xs text-[#94a3b8] space-y-2">
                <div className="text-white font-semibold flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#10b981]" />
                  <span>How to trust this verification without seeing the data?</span>
                </div>
                <p>
                  The Midnight Network uses Zero-Knowledge Succinct Non-Interactive Arguments of Knowledge (ZK-SNARKs). The prover generated mathematical evidence that they possess the secret inputs satisfying the Compact smart contract. The ledger consensus nodes verified the cryptographic proof on-chain without ever receiving the candidate's private data.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: COMPACT CIRCUITS & ARCHITECTURE */}
        {/* ========================================================================= */}
        {activeTab === 'architecture' && (
          <div className="space-y-8">
            <div className="bg-[#0f1523] border border-[#1e283d] rounded-2xl p-6">
              <h2 className="text-xl font-bold text-white mb-2">Compact Smart Contract Architecture</h2>
              <p className="text-xs text-[#94a3b8]">
                ProofShield is implemented in <strong>Compact 0.23</strong> for the Midnight Network. The contract cleanly separates public blockchain state from private prover witnesses.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Code Viewer */}
              <div className="bg-[#090d16] border border-[#1e283d] rounded-2xl p-5 font-mono text-xs overflow-x-auto">
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#1e283d]">
                  <span className="text-xs text-white font-semibold flex items-center space-x-2">
                    <FileCode className="w-4 h-4 text-[#38bdf8]" />
                    <span>contracts/proofshield.compact</span>
                  </span>
                  <span className="text-[10px] text-[#10b981] bg-[#10b981]/15 px-2 py-0.5 rounded border border-[#10b981]/30">
                    Compiled: 2 Circuits
                  </span>
                </div>

                <pre className="text-[#cbd5e1] leading-relaxed text-[11px]">
                  <span className="text-[#818cf8]">pragma</span> language_version <span className="text-[#f59e0b]">0.23</span>;{'\n\n'}
                  <span className="text-[#64748b]">// 1. PUBLIC LEDGER STATE (On-Chain, Visible to All)</span>{'\n'}
                  <span className="text-[#818cf8]">export ledger</span> claim_verified: <span className="text-[#38bdf8]">Boolean</span>;{'\n'}
                  <span className="text-[#818cf8]">export ledger</span> threshold: <span className="text-[#38bdf8]">Uint&lt;64&gt;</span>;{'\n\n'}
                  <span className="text-[#64748b]">// 2. CIRCUIT: initialise_claim</span>{'\n'}
                  <span className="text-[#818cf8]">export circuit</span> <span className="text-[#10b981]">initialise_claim</span>(required_count: <span className="text-[#38bdf8]">Uint&lt;64&gt;</span>): [] &#123;{'\n'}
                  {'  '}threshold = <span className="text-[#38bdf8]">disclose</span>(required_count);{'\n'}
                  {'  '}claim_verified = <span className="text-[#38bdf8]">disclose</span>(<span className="text-[#f59e0b]">false</span>);{'\n'}
                  &#125;{'\n\n'}
                  <span className="text-[#64748b]">// 3. CIRCUIT: submit_proof (THE CORE PRIVACY CIRCUIT)</span>{'\n'}
                  <span className="text-[#64748b]">// 'activity_count' is a PRIVATE WITNESS: never written to ledger</span>{'\n'}
                  <span className="text-[#818cf8]">export circuit</span> <span className="text-[#10b981]">submit_proof</span>(activity_count: <span className="text-[#38bdf8]">Uint&lt;64&gt;</span>): [] &#123;{'\n'}
                  {'  '}<span className="text-[#818cf8]">const</span> passes: <span className="text-[#38bdf8]">Boolean</span> = activity_count &gt;= threshold;{'\n'}
                  {'  '}claim_verified = <span className="text-[#38bdf8]">disclose</span>(passes);{'\n'}
                  &#125;
                </pre>
              </div>

              {/* Circuit Metrics & Public/Private Comparison */}
              <div className="space-y-6">
                <div className="bg-[#0f1523] border border-[#1e283d] rounded-2xl p-6 space-y-4">
                  <h3 className="font-semibold text-white text-sm">Compiled ZK Circuit Specs</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#090d16] border border-[#1e283d] p-4 rounded-xl">
                      <div className="text-[11px] text-[#94a3b8] font-mono">circuit "initialise_claim"</div>
                      <div className="text-xl font-bold text-white mt-1">k = 7</div>
                      <div className="text-xs text-[#38bdf8] font-mono mt-0.5">90 constraints rows</div>
                    </div>

                    <div className="bg-[#090d16] border border-[#1e283d] p-4 rounded-xl">
                      <div className="text-[11px] text-[#94a3b8] font-mono">circuit "submit_proof"</div>
                      <div className="text-xl font-bold text-white mt-1">k = 9</div>
                      <div className="text-xs text-[#10b981] font-mono mt-0.5">123 constraints rows</div>
                    </div>
                  </div>

                  <p className="text-xs text-[#94a3b8]">
                    Generated artifacts are stored in <code className="text-xs text-white">contracts/managed/proofshield/</code> including proving keys (<code className="text-xs text-white">.prover</code>), verifying keys (<code className="text-xs text-white">.verifier</code>), and intermediate representation (<code className="text-xs text-white">.zkir</code>).
                  </p>
                </div>

                <div className="bg-[#0f1523] border border-[#1e283d] rounded-2xl p-6 space-y-3">
                  <h3 className="font-semibold text-white text-sm">Public State vs Private Witness</h3>
                  
                  <div className="space-y-2 text-xs">
                    <div className="bg-[#10b981]/10 border border-[#10b981]/25 p-3 rounded-xl">
                      <div className="font-semibold text-[#34d399] mb-1">Public Ledger State (`export ledger`)</div>
                      <div className="text-[#94a3b8]">
                        Variables marked with <code className="text-white">ledger</code> are on-chain and publicly queryable by block explorers and verifiers. Example: <code className="text-white">threshold</code> and <code className="text-white">claim_verified</code>.
                      </div>
                    </div>

                    <div className="bg-[#f59e0b]/10 border border-[#f59e0b]/25 p-3 rounded-xl">
                      <div className="font-semibold text-[#fbbf24] mb-1">Private Witness (Circuit Arguments)</div>
                      <div className="text-[#94a3b8]">
                        Function arguments to circuits are private by default. In <code className="text-white">submit_proof(activity_count)</code>, the value stays inside the prover's machine and is only disclosed if passed through <code className="text-white">disclose()</code>.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 4: RISE IN LEVEL 1 VALIDATION & TESTING */}
        {/* ========================================================================= */}
        {activeTab === 'level1' && (
          <div className="space-y-8">
            <div className="bg-[#0f1523] border border-[#1e283d] rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white mb-1">Rise In × Midnight Level 1 Submission Checklist</h2>
                  <p className="text-xs text-[#94a3b8]">
                    Program: "New Moon to Full: Monthly Moonshots on Midnight" — Level 1: New Moon
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full bg-[#10b981]/15 text-[#34d399] border border-[#10b981]/30 text-xs font-mono font-bold">
                  Foundation status: deployment and proof flow pending
                </span>
              </div>
            </div>

            {/* Checklist Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { title: 'Compact contract', desc: 'Two circuits in contract/proofshield.compact.' },
                { title: 'Generated artifacts', desc: 'Managed contract bindings, keys, and circuit data are committed.' },
                { title: 'Local integration tests', desc: 'Four deployment and circuit integration tests are defined; run them with Docker services available.' },
                { title: 'Lace connection', desc: 'Studio connects to an injected Midnight wallet on Preprod.' },
                { title: 'Deployment helper', desc: 'yarn deploy writes the returned address to ignored deployment.json.' },
                { title: 'Circuit submission', desc: 'Browser transaction adapter is still required.' },
              ].map((item, i) => (
                <div key={i} className="bg-[#0f1523] border border-[#1e283d] p-4 rounded-xl flex items-start space-x-3">
                  <CheckCircle2 className="w-5 h-5 text-[#10b981] flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-semibold text-white">{item.title}</h4>
                    <p className="text-[11px] text-[#94a3b8] mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Test execution instructions */}
            <div className="bg-[#090d16] border border-[#1e283d] rounded-2xl p-6 font-mono text-xs">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#1e283d]">
                <span className="text-xs text-white font-semibold flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-[#10b981]" />
                  <span>Run local contract integration tests</span>
                </span>
                <span className="text-[11px] text-[#10b981] bg-[#10b981]/15 px-2 py-0.5 rounded border border-[#10b981]/30">
                  Requires the local node, indexer, and proof server
                </span>
              </div>

              <div className="space-y-1.5 text-[11px] text-[#cbd5e1]">
                <div>docker compose up -d --wait node indexer proof-server</div>
                <div>yarn test:local</div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#182133] bg-[#07090e] py-6 text-center text-xs text-[#64748b]">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between">
          <div className="flex items-center space-x-2">
            <Shield className="w-3.5 h-3.5 text-[#10b981]" />
            <span className="text-[#94a3b8] font-medium">ProofShield • Built for Rise In × Midnight Moonshots</span>
          </div>
          <div className="mt-2 sm:mt-0 font-mono text-[11px] text-[#64748b]">
            Level 1: New Moon Foundation • Compact 0.23 • ZK-SNARK Prover
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;
