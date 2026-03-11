import {
	CheckCircle,
	Heart,
	Home,
	Mic,
	PartyPopper,
	RotateCcw,
	Star,
	Waves
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ReadAloudScoreResult } from '../api/read-aloud';
import './EvaluationPage.scss';

interface LocationState {
	evaluation: ReadAloudScoreResult;
	sceneName: string;
	sceneId: string;
}

// 100分制转5星制
const scoreToStars = (score: number): number => {
	if (score >= 90) return 5;
	if (score >= 75) return 4;
	if (score >= 60) return 3;
	if (score >= 40) return 2;
	if (score > 0) return 1;
	return 0;
};

// 显示星星（输入100分制，转换为星星）
const StarRating = ({ score, size = 20 }: { score: number; size?: number }) => {
	const stars = scoreToStars(score);
	return (
		<div className="star-rating">
			{[1, 2, 3, 4, 5].map((star) => (
				<Star
					key={star}
					size={size}
					className={`star ${star <= stars ? 'filled' : 'empty'}`}
				/>
			))}
		</div>
	);
};

export default function ReadAloudEvaluationPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const state = location.state as LocationState | null;

	if (!state?.evaluation) {
		return (
			<main className="app-shell evaluation-shell">
				<div className="no-data">
					<PartyPopper size={64} />
					<h2>没有评分数据</h2>
					<p>请先完成一次跟读练习</p>
					<button className="primary-btn" onClick={() => navigate('/')}>
						<Home size={18} />
						返回首页
					</button>
				</div>
			</main>
		);
	}

	const { evaluation, sceneName, sceneId } = state;

	// 根据100分制获取主题
	const getTheme = (score: number) => {
		if (score >= 90) return { emoji: '🏆', title: '太棒了！发音超标准！', className: 'theme-gold' };
		if (score >= 75) return { emoji: '🌟', title: '非常优秀！继续保持！', className: 'theme-purple' };
		if (score >= 60) return { emoji: '👍', title: '做得不错！还能更好！', className: 'theme-blue' };
		if (score >= 40) return { emoji: '💪', title: '有进步！继续加油！', className: 'theme-green' };
		if (score > 0) return { emoji: '🌱', title: '勇敢的开始！每次都在进步！', className: 'theme-orange' };
		// 0分 = 没有有效朗读
		return { emoji: '🎤', title: '请大声朗读，让我听到你的声音！', className: 'theme-gray' };
	};

	const theme = getTheme(evaluation.totalScore);

	// 评分维度配置（4个维度，100分制）
	const scoreItems = [
		{ icon: Mic, label: '语音语调', score: evaluation.intonationScore },
		{ icon: Waves, label: '流利连贯', score: evaluation.fluencyScore },
		{ icon: CheckCircle, label: '准确完整', score: evaluation.accuracyScore },
		{ icon: Heart, label: '情感表现力', score: evaluation.expressionScore },
	];

	return (
		<main className={`app-shell evaluation-shell ${theme.className}`}>
			<div className="evaluation-card">
				{/* 左侧：星级和分项 */}
				<div className="eval-left">
					<div className="star-hero">
						<span className="hero-emoji">{theme.emoji}</span>
						<StarRating score={evaluation.totalScore} size={32} />
						<p className="hero-title">{theme.title}</p>
					</div>

					<div className="scene-info">
						<h4>📍 {sceneName}</h4>
						<p className="scene-desc">英语跟读练习</p>
					</div>

					<div className="score-items">
						{scoreItems.map(({ icon: Icon, label, score }) => (
							<div className="score-item" key={label}>
								<div className="item-icon"><Icon size={16} /></div>
								<span className="item-label">{label}</span>
								<StarRating score={score} size={14} />
							</div>
						))}
					</div>
				</div>

				{/* 右侧：反馈内容 */}
				<div className="eval-right">
					<div className="feedback-main">
						<h4>💬 老师说</h4>
						<p>{evaluation.feedback}</p>
					</div>

					{evaluation.strengths?.length > 0 && (
						<div className="feedback-section strengths">
							<h4>✨ 亮点</h4>
							<ul>
								{evaluation.strengths.map((s, i) => <li key={i}>{s}</li>)}
							</ul>
						</div>
					)}

					{evaluation.improvements?.length > 0 && (
						<div className="feedback-section improvements">
							<h4>💡 小建议</h4>
							<ul>
								{evaluation.improvements.map((s, i) => <li key={i}>{s}</li>)}
							</ul>
						</div>
					)}
				</div>
			</div>

			<div className="eval-actions">
				<button className="action-btn secondary" onClick={() => navigate(`/read-aloud/${sceneId}`)}>
					<RotateCcw size={18} />
					再练一次
				</button>
				<button className="action-btn primary" onClick={() => navigate('/')}>
					<Home size={18} />
					选择新场景
				</button>
			</div>
		</main>
	);
}

