
import { useMount } from 'ahooks';
import {
	BookOpen,
	Bot,
	Keyboard,
	Loader2,
	MessageCircle,
	Mic,
	MicOff,
	PartyPopper,
	Send,
	Sparkles,
	Star,
	Trophy,
	Volume2
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { dialogueApi, evaluationApi, type DialogueMessage, type DialogueSession, type WorkflowSubmitResponse } from '../api';
import BackButton from '../components/BackButton';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import './DialoguePage.scss';

// 100分制转5星级
const scoreToStars = (score: number): number => {
	if (score >= 90) return 5;
	if (score >= 75) return 4;
	if (score >= 60) return 3;
	if (score >= 40) return 2;
	return 1;
};

export default function DialoguePage() {
	const {sceneId} = useParams();
	const navigate = useNavigate();
	const chatPanelRef = useRef<HTMLElement>(null);

	const [session, setSession] = useState<DialogueSession | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState('');
	const [inputText, setInputText] = useState('');
	const [isStreaming, setIsStreaming] = useState(false); // 是否正在流式生成
	const [evaluation, setEvaluation] = useState<WorkflowSubmitResponse['scores'] | null>(null); // 评分结果
	const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice'); // 输入模式
	// 累积学生每轮语音识别结果（用于评分）
	const [studentTranscriptions, setStudentTranscriptions] = useState<string[]>([]);

	// 用 ref 追踪最新的 session，以便在回调中获取最新值
	const sessionRef = useRef<DialogueSession | null>(null);
	useEffect(() => {
		sessionRef.current = session;
	}, [session]);


	// 语音录制和播放
	const audioRecorder = useAudioRecorder();
	const audioPlayer = useAudioPlayer();

	// 滚动到底部
	const scrollToBottom = () => {
		if (chatPanelRef.current) {
			chatPanelRef.current.scrollTop = chatPanelRef.current.scrollHeight;
		}
	};

	const hadInit = useRef(false);
	// 初始化对话会话
	useMount(() => {
		if (hadInit.current) {
			return;
		}
		hadInit.current = true;
		if (!sceneId) {
			navigate('/', {replace: true});
			return;
		}
		startDialogue();
	});

	// 消息更新后滚动到底部
	useEffect(() => {
		scrollToBottom();
	}, [session?.messages]);

	const startDialogue = async () => {
		if (!sceneId) return;

		try {
			setIsLoading(true);
			setError('');
			setIsStreaming(false);

			let audioToPlay = '';

			// 使用流式 API 开始对话（AI 生成开场白 + 音频 + 翻译）
			await dialogueApi.startStream(sceneId, {
				onSession: (data: { practiceId: number; sceneId: string; sceneName: string; sceneDescription?: string; currentRound: number; totalRounds: number }) => {
					// 收到 session 信息，初始化会话，添加 AI 消息用于流式显示
					setSession({
						practiceId: data.practiceId,
						sceneId: data.sceneId,
						sceneName: data.sceneName,
						sceneDescription: data.sceneDescription,
						currentRound: data.currentRound,
						totalRounds: data.totalRounds,
						messages: [{
							id: `ai_${Date.now()}`,
							role: 'ai',
							text: '',
							timestamp: Date.now(),
						}],
						status: 'active',
					});
					setIsLoading(false);
					setIsStreaming(true);
				},
				onTextChunk: (chunk) => {
					// 直接更新最后一条消息的 text
					setSession(prev => {
						if (!prev) return prev;
						const messages = [...prev.messages];
						const lastMsg = messages[messages.length - 1];
						if (lastMsg && lastMsg.role === 'ai') {
							messages[messages.length - 1] = { ...lastMsg, text: lastMsg.text + chunk };
						}
						return { ...prev, messages };
					});
				},
				onTranslationChunk: (chunk) => {
					// 直接更新最后一条消息的 translation
					setSession(prev => {
						if (!prev) return prev;
						const messages = [...prev.messages];
						const lastMsg = messages[messages.length - 1];
						if (lastMsg && lastMsg.role === 'ai') {
							messages[messages.length - 1] = {
								...lastMsg,
								translation: (lastMsg.translation || '') + chunk
							};
						}
						return { ...prev, messages };
					});
				},
				onTranslation: () => {
					// 翻译完成，标记流式结束
					setIsStreaming(false);
				},
				onAudio: (audio) => {
					audioToPlay = audio;
				},
				onDone: async (data) => {
					// 更新 session 中的其他字段（保持消息不变，因为已经流式更新了）
					setSession(prev => prev ? {
						...prev,
						...data.session,
						messages: prev.messages, // 保持已流式更新的消息
					} : null);

					// 播放开场白音频
					if (audioToPlay) {
						console.log('Playing greeting audio, length:', audioToPlay.length);
						try {
							await audioPlayer.play(audioToPlay, 'wav');
						} catch (err) {
							console.error('Failed to play greeting audio:', err);
						}
					}
				},
				onError: (errorMsg) => {
					setError(errorMsg || '开始对话失败');
					setIsStreaming(false);
					setIsLoading(false);
				},
			});
		} catch (err) {
			console.error('Failed to start dialogue:', err);
			setError('开始对话失败，请重试');
			setIsLoading(false);
		}
	};

	const handleSubmit = async () => {
		if (!session || isSubmitting || session.status === 'completed') return;
		if (!inputText.trim()) {
			setError('请输入内容');
			return;
		}

		const userText = inputText.trim();
		setInputText('');

		// 使用统一的音频 API（支持文字输入，也会返回音频）
		await submitWithAudio(undefined, userText);
	};

	// 统一的提交函数：使用 LangGraph 工作流（流式：对话+翻译+评分）
	const submitWithAudio = async (audioBase64?: string, text?: string) => {
		if (!session || isSubmitting) return;

		try {
			setIsSubmitting(true);
			setError('');
			setIsStreaming(true);

			// 乐观更新：添加学生消息和 AI 消息（用于流式显示）
			const studentMessage: DialogueMessage = {
				id: `student_${Date.now()}`,
				role: 'student',
				text: text || '🎤 (语音输入)',
				timestamp: Date.now(),
			};
			const aiMessage: DialogueMessage = {
				id: `ai_${Date.now()}`,
				role: 'ai',
				text: '',
				timestamp: Date.now(),
			};
			setSession(prev => prev ? {
				...prev,
				messages: [...prev.messages, studentMessage, aiMessage]
			} : null);

			let audioToPlay = '';
			let pendingScores: WorkflowSubmitResponse['scores'] | null = null;

			// 使用流式工作流 API
			await dialogueApi.submitWorkflowStream(
				session.practiceId,
				audioBase64,
				text,
				{
					onTextChunk: (chunk) => {
						// 直接更新最后一条 AI 消息的 text
						setSession(prev => {
							if (!prev) return prev;
							const messages = [...prev.messages];
							const lastMsg = messages[messages.length - 1];
							if (lastMsg && lastMsg.role === 'ai') {
								messages[messages.length - 1] = { ...lastMsg, text: lastMsg.text + chunk };
							}
							return { ...prev, messages };
						});
					},
					onTranslationChunk: (chunk) => {
						// 直接更新最后一条 AI 消息的 translation
						setSession(prev => {
							if (!prev) return prev;
							const messages = [...prev.messages];
							const lastMsg = messages[messages.length - 1];
							if (lastMsg && lastMsg.role === 'ai') {
								messages[messages.length - 1] = {
									...lastMsg,
									translation: (lastMsg.translation || '') + chunk
								};
							}
							return { ...prev, messages };
						});
					},
					onTranslation: async () => {
						// 翻译完成，标记流式结束
						setIsStreaming(false);

						// 翻译完成后立即播放音频，不等评分
						if (audioToPlay) {
							console.log('[Workflow] Translation done, starting audio playback...');
							try {
								await audioPlayer.play(audioToPlay, 'wav');
								console.log('[Workflow] Audio playback completed');
							} catch (err) {
								console.error('[Workflow] Failed to play AI audio:', err);
							}
						}
					},
					onAudio: (audio) => {
						console.log('[Workflow] Received audio, length:', audio?.length || 0);
						audioToPlay = audio;
					},
					onStudentTranscription: (transcription) => {
						console.log('[Workflow] Student transcription:', transcription);
						// 累积学生语音识别结果
						setStudentTranscriptions(prev => [...prev, transcription]);
						// 更新学生消息显示（用识别结果替换占位符）
						setSession(prev => {
							if (!prev) return prev;
							const messages = [...prev.messages];
							// 找到倒数第二条消息（学生消息）
							const studentMsgIndex = messages.length - 2;
							if (studentMsgIndex >= 0 && messages[studentMsgIndex].role === 'student') {
								messages[studentMsgIndex] = {
									...messages[studentMsgIndex],
									text: transcription || messages[studentMsgIndex].text
								};
							}
							return { ...prev, messages };
						});
					},
					onScores: (scores) => {
						// 注意：现在评分由前端单独调用，这里不再处理
						console.log('[Workflow] onScores callback (deprecated):', scores);
					},
					onDone: async (data) => {
						console.log('[Workflow] onDone called, isComplete:', data.isComplete);

						// 更新 session 的其他字段（消息已经流式更新过了，保持不变）
						setSession(prev => prev ? {
							...prev,
							...data.session,
							messages: prev.messages, // 保持已流式更新的消息
							status: data.isComplete ? 'completed' : 'active',
						} : null);

						// 如果对话完成，等音频播放完成后调用独立评分接口
						if (data.isComplete && data.session) {
							// 等待音频播放完成（如果还在播放的话）
							while (audioPlayer.isPlaying) {
								await new Promise(resolve => setTimeout(resolve, 100));
							}

							console.log('[Workflow] Dialogue complete, calling evaluate API...');

							try {
								// 从 sessionRef 获取最新的消息（state 中的，已经被流式更新过）
								const currentSession = sessionRef.current;
								if (!currentSession) {
									console.error('[Workflow] No session found in ref');
									setError('评分失败：会话数据丢失');
									return;
								}

								const currentMessages = currentSession.messages || [];
								console.log('[Workflow] Current messages count:', currentMessages.length);

								// 构建对话历史：交替的 AI 和学生消息
								const dialogueHistory: Array<{role: 'ai' | 'student', content: string}> = [];

								// 从 messages 中提取，确保使用正确的学生内容
								currentMessages.forEach((msg) => {
									if (msg.role === 'ai') {
										dialogueHistory.push({ role: 'ai', content: msg.text });
									} else {
										// 学生消息使用 text 字段（已经被 transcription 更新过）
										dialogueHistory.push({ role: 'student', content: msg.text });
									}
								});

								console.log('[Workflow] Calling evaluate with practiceId:', data.session.practiceId);
								console.log('[Workflow] Dialogue history length:', dialogueHistory.length);
								console.log('[Workflow] Dialogue history:', dialogueHistory);

								if (dialogueHistory.length === 0) {
									console.error('[Workflow] Empty dialogue history!');
									setError('评分失败：对话记录为空');
									return;
								}

								const scores = await evaluationApi.evaluate({
									practiceId: data.session.practiceId,
									dialogueHistory,
								});

								console.log('[Workflow] Evaluation result:', scores);

								// 跳转到评分页面
								navigate('/evaluation', {
									state: {
										evaluation: scores,
										sceneName: currentSession.sceneName,
										sceneDescription: currentSession.sceneDescription,
										sceneId: currentSession.sceneId,
									}
								});
							} catch (err) {
								console.error('[Workflow] Evaluation failed:', err);
								setError('评分失败，请重试');
							}
						}
					},
					onError: (errorMsg) => {
						setError(errorMsg || '提交失败，请重试');
						setIsStreaming(false);
					},
				}
			);
		} catch (err) {
			console.error('Failed to submit:', err);
			setError('提交失败，请重试');
			setIsStreaming(false);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' && !e.shiftKey) {
			e.preventDefault();
			if (!isInteractionDisabled && inputText.trim()) {
				handleSubmit();
			}
		}
	};

	// 开始/停止录音
	const handleVoiceToggle = async () => {
		if (audioRecorder.isRecording) {
			// 停止录音并提交
			const audioBase64 = await audioRecorder.stopRecording();
			if (audioBase64) {
				await submitWithAudio(audioBase64, undefined);
			}
		} else {
			// 开始录音
			try {
				await audioRecorder.startRecording();
			} catch (err) {
				setError('无法访问麦克风，请检查权限');
			}
		}
	};

	if (isLoading) {
		return (
			<main className="app-shell dialogue-shell">
				<div className="loading-state">
					<div className="spinner"></div>
					<p>正在准备对话...</p>
				</div>
			</main>
		);
	}

	if (!session) {
		return (
			<main className="app-shell dialogue-shell">
				<div className="error-state">
					<p>{error || '加载失败'}</p>
					<button className="primary-btn" onClick={startDialogue}>重试</button>
					<button className="ghost-btn" onClick={() => navigate('/')}>返回</button>
				</div>
			</main>
		);
	}

	const isPracticeFinished = session.status === 'completed';
	// 判断是否可以交互（正在提交、正在生成、正在播放音频时不可交互）
	const isInteractionDisabled = isSubmitting || isStreaming || audioPlayer.isPlaying;

	// 获取当前状态提示
	const getStatusMessage = () => {
		if (audioPlayer.isPlaying) return '正在播放音频...';
		if (isStreaming) return '正在生成回复...';
		if (isSubmitting) return '正在处理...';
		if (isPracticeFinished) return '练习完成！🎉';
		return '等待你的回复...';
	};

	// 获取动物心情
	const getAnimalMood = () => {
		if (isPracticeFinished) return 'celebrate';
		if (audioPlayer.isPlaying) return 'listening';
		if (isStreaming) return 'thinking';
		if (isSubmitting) return 'waiting';
		return 'idle';
	};

	return (
		<main className="app-shell dialogue-shell">
			<div className="dialogue-content">
				{/* 左侧：对话区域（合并为一个卡片） */}
				<div className="dialogue-left">
					<div className="chat-card">
						{/* 卡片头部：返回按钮 */}
						<div className="chat-card-header">
							<BackButton />
						</div>

						{/* 对话内容区域（可滚动） */}
						<section className="chat-messages" ref={chatPanelRef}>
							{session.messages.map((message, index) => {
								const isLastAi = message.role === 'ai' && index === session.messages.length - 1;
								const showTranslationLoading = isLastAi && isStreaming && !message.translation;

								return (
									<div
										key={message.id}
										className={`chat-row ${message.role === 'student' ? 'student' : 'ai'}`}
									>
										<div className="bubble">
											<span className="role">
												{message.role === 'student' ? (
													<><Mic size={14}/> 我</>
												) : (
													<><Bot size={14}/> AI 老师</>
												)}
											</span>
											<p className="message-english">{message.text}</p>
											{/* AI 消息显示翻译 */}
											{message.role === 'ai' && (
												message.translation ? (
													<p className="message-translation">{message.translation}</p>
												) : showTranslationLoading ? (
													<p className="message-translation translation-loading">
														<Loader2 size={14} className="spin" />
														<span>正在翻译...</span>
													</p>
												) : null
											)}
										</div>
									</div>
								);
							})}
						</section>

						{error && <div className="error-toast">{error}</div>}

						{/* 输入区域（固定在底部） */}
						<footer className="chat-card-footer">
				{isPracticeFinished ? (
					<div className={`finished-panel rating-${scoreToStars(evaluation?.totalScore || 60)}`}>
						{evaluation ? (
							<div className="evaluation-panel">
								{/* 顶部：星级展示 + 鼓励语 */}
								<div className="eval-header">
									<div className="star-display">
										{[1, 2, 3, 4, 5].map((star) => (
											<Star
												key={star}
												size={28}
												className={`star ${star <= scoreToStars(evaluation.totalScore) ? 'filled' : 'empty'}`}
											/>
										))}
									</div>
									<div className="rating-title">
										{evaluation.totalScore >= 90 ? '🎉 太棒了！完美表现！' :
										 evaluation.totalScore >= 75 ? '🌟 非常优秀！继续保持！' :
										 evaluation.totalScore >= 60 ? '👍 做得不错！还能更好！' :
										 evaluation.totalScore >= 40 ? '💪 有进步！继续加油！' :
										 '🌱 勇敢的开始！每次都在进步！'}
									</div>
								</div>

								{/* 中间：分项评分 + 优点建议 */}
								<div className="eval-content">
									{/* 分项星级 */}
									<div className="score-categories">
										<div className="score-category">
											<span className="cat-icon"><BookOpen size={14}/></span>
											<span className="cat-name">词汇</span>
											<div className="cat-stars">
												{[1, 2, 3, 4, 5].map((s) => (
													<Star key={s} size={12} className={s <= scoreToStars(evaluation.vocabularyScore) ? 'filled' : 'empty'}/>
												))}
											</div>
										</div>
										<div className="score-category">
											<span className="cat-icon"><Sparkles size={14}/></span>
											<span className="cat-name">语法</span>
											<div className="cat-stars">
												{[1, 2, 3, 4, 5].map((s) => (
													<Star key={s} size={12} className={s <= scoreToStars(evaluation.grammarScore) ? 'filled' : 'empty'}/>
												))}
											</div>
										</div>
										<div className="score-category">
											<span className="cat-icon"><MessageCircle size={14}/></span>
											<span className="cat-name">交流</span>
											<div className="cat-stars">
												{[1, 2, 3, 4, 5].map((s) => (
													<Star key={s} size={12} className={s <= scoreToStars(evaluation.communicationScore) ? 'filled' : 'empty'}/>
												))}
											</div>
										</div>
										<div className="score-category">
											<span className="cat-icon"><Trophy size={14}/></span>
											<span className="cat-name">努力</span>
											<div className="cat-stars">
												{[1, 2, 3, 4, 5].map((s) => (
													<Star key={s} size={12} className={s <= scoreToStars(evaluation.effortScore) ? 'filled' : 'empty'}/>
												))}
											</div>
										</div>
									</div>

									{/* 优点和建议 */}
									<div className="eval-feedback">
										{evaluation.strengths.length > 0 && (
											<div className="highlights">
												<h4>✨ 亮点</h4>
												<ul>
													{evaluation.strengths.map((s: string, i: number) => (
														<li key={i}>{s}</li>
													))}
												</ul>
											</div>
										)}
										{evaluation.improvements.length > 0 && (
											<div className="improvements">
												<h4>💡 建议</h4>
												<ul>
													{evaluation.improvements.map((s: string, i: number) => (
														<li key={i}>{s}</li>
													))}
												</ul>
											</div>
										)}
									</div>
								</div>

								{/* 底部：鼓励文字 + 按钮 */}
								<div className="eval-footer">
									<p className="feedback-text">{evaluation.feedback}</p>
									<button className="primary-btn" onClick={() => navigate('/')}>
										🏠 再练一次
									</button>
								</div>
							</div>
						) : (
							<div className="no-evaluation">
								<PartyPopper size={40}/>
								<p>🎉 恭喜完成练习！</p>
								<button className="primary-btn" onClick={() => navigate('/')}>
									返回首页
								</button>
							</div>
						)}
					</div>
				) : (
					<div className="input-panel">
						{/* 模式切换按钮 */}
						<button
							className="mode-toggle"
							onClick={() => setInputMode(inputMode === 'voice' ? 'text' : 'voice')}
							title={inputMode === 'voice' ? '切换到文字输入' : '切换到语音输入'}
						>
							{inputMode === 'voice' ? <Keyboard size={18}/> : <Mic size={18}/>}
						</button>

						{inputMode === 'voice' ? (
							/* 语音输入模式 */
							<div className="voice-input">
								<button
									className={`voice-btn ${audioRecorder.isRecording ? 'recording' : ''} ${isInteractionDisabled && !audioRecorder.isRecording ? 'disabled' : ''}`}
									onClick={handleVoiceToggle}
									disabled={isInteractionDisabled && !audioRecorder.isRecording}
								>
									{isInteractionDisabled && !audioRecorder.isRecording ? (
										audioPlayer.isPlaying ? (
											<>
												<Volume2 size={24} className="sound-wave"/>
												<span>播放中...</span>
											</>
										) : (
											<>
												<Loader2 size={24} className="spin"/>
												<span>生成中...</span>
											</>
										)
									) : audioRecorder.isRecording ? (
										<>
											<MicOff size={24}/>
											<span className="recording-time">{audioRecorder.recordingTime}s</span>
										</>
									) : (
										<>
											<Mic size={24}/>
											<span>按住说话</span>
										</>
									)}
								</button>
								{audioRecorder.isRecording && (
									<div className="recording-indicator">
										<span className="pulse"></span>
										正在录音...
									</div>
								)}
							</div>
						) : (
							/* 文字输入模式 */
							<div className="text-input-wrapper">
								<input
									type="text"
									className="text-input"
									placeholder={isInteractionDisabled ? (audioPlayer.isPlaying ? '正在播放音频...' : '正在生成回复...') : '输入你的回答...'}
									value={inputText}
									onChange={(e) => setInputText(e.target.value)}
									onKeyDown={handleKeyDown}
									disabled={isInteractionDisabled}
								/>
								<button
									className="submit-btn"
									onClick={handleSubmit}
									disabled={isInteractionDisabled || !inputText.trim()}
								>
									{isInteractionDisabled ? (
										<Loader2 size={18} className="spin"/>
									) : (
										<Send size={18}/>
									)}
								</button>
							</div>
						)}
					</div>
				)}
						<p className="tips">
							{isPracticeFinished
								? '已完成所有对话轮次，做得很棒！'
								: inputMode === 'voice'
									? '点击麦克风开始录音'
									: '输入英文回答'}
						</p>
						</footer>
					</div>
				</div>

				{/* 右侧：进度面板 */}
				<aside className="dialogue-right">
					<div className="progress-panel">
						<h3>🌟 对话冒险</h3>
						<div className="progress-stars">
							{Array.from({ length: session.totalRounds }, (_, i) => {
								const roundNum = i + 1;
								const isCompleted = roundNum < session.currentRound;
								const isCurrent = roundNum === session.currentRound;
								const isPending = roundNum > session.currentRound;
								return (
									<div
										key={i}
										className={`star-item ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''} ${isPending ? 'pending' : ''}`}
									>
										<span className="star-icon">
											{isCompleted ? '⭐' : isCurrent ? '🌟' : '💫'}
										</span>
										<span className="star-num">{roundNum}</span>
									</div>
								);
							})}
						</div>
						<div className="progress-message">
							{isPracticeFinished ? (
								<span className="complete">🎉 全部完成！太棒了！</span>
							) : (
								<span>第 <strong>{session.currentRound}</strong> 轮冒险中...</span>
							)}
						</div>
					</div>

					{/* 可爱的动物角色 + 场景信息 */}
					<div className={`mascot-container ${getAnimalMood()}`}>
						{/* 场景信息（保持顶部） */}
						<div className="scene-info">
							<h4>📍 {session.sceneName}</h4>
							{session.sceneDescription && (
								<p className="scene-desc">{session.sceneDescription}</p>
							)}
						</div>

						{/* 动物区域（垂直居中） */}
						<div className="mascot-area">
							{/* 动物角色 */}
							<div className="mascot">
								<div className="mascot-body">
									<div className="mascot-face">
										<div className="mascot-eyes">
											<span className="eye left"></span>
											<span className="eye right"></span>
										</div>
										<div className="mascot-mouth"></div>
										<div className="mascot-cheeks">
											<span className="cheek left"></span>
											<span className="cheek right"></span>
										</div>
									</div>
									<div className="mascot-ears">
										<span className="ear left"></span>
										<span className="ear right"></span>
									</div>
								</div>
							</div>

							{/* 状态消息 */}
							<div className="mascot-message">
								<p>{getStatusMessage()}</p>
							</div>
						</div>
					</div>
				</aside>
			</div>
		</main>
	);
}
