import {
	BookOpen,
	Home,
	MessageCircle,
	PartyPopper,
	RotateCcw,
	Sparkles,
	Star,
	Trophy
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import './EvaluationPage.scss';

// 评分结果类型
interface EvaluationResult {
	totalScore: number;
	vocabularyScore: number;
	grammarScore: number;
	communicationScore: number;
	effortScore: number;
	feedback: string;
	strengths: string[];
	improvements: string[];
}

interface LocationState {
	evaluation: EvaluationResult;
	sceneName: string;
	sceneDescription?: string;
	sceneId: string;
}

// 100分制转5星级
const scoreToStars = (score: number): number => {
	if (score >= 90) return 5;
	if (score >= 75) return 4;
	if (score >= 60) return 3;
	if (score >= 40) return 2;
	return 1;
};

// 星星组件
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

export default function EvaluationPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const state = location.state as LocationState | null;

	// 如果没有评分数据，返回首页
	if (!state?.evaluation) {
		return (
			<main className="app-shell evaluation-shell">
				<div className="no-data">
					<PartyPopper size={64} />
					<h2>没有评分数据</h2>
					<p>请先完成一次对话练习</p>
					<button className="primary-btn" onClick={() => navigate('/')}>
						<Home size={18} />
						返回首页
					</button>
				</div>
			</main>
		);
	}

	const { evaluation, sceneName, sceneDescription, sceneId } = state;

	// 根据分数获取主题（100分制）
	const getTheme = (score: number) => {
		if (score >= 90) return { emoji: '🏆', title: '太棒了！完美表现！', className: 'theme-gold' };
		if (score >= 75) return { emoji: '🌟', title: '非常优秀！继续保持！', className: 'theme-purple' };
		if (score >= 60) return { emoji: '👍', title: '做得不错！还能更好！', className: 'theme-blue' };
		if (score >= 40) return { emoji: '💪', title: '有进步！继续加油！', className: 'theme-green' };
		return { emoji: '🌱', title: '勇敢的开始！每次都在进步！', className: 'theme-orange' };
	};

	const theme = getTheme(evaluation.totalScore);

	return (
		<main className={`app-shell evaluation-shell ${theme.className}`}>
			<div className="evaluation-card">
				{/* 左侧：星级和分项 */}
				<div className="eval-left">
					{/* 星级展示 */}
					<div className="star-hero">
						<span className="hero-emoji">{theme.emoji}</span>
						<StarRating score={evaluation.totalScore} size={32} />
						<p className="hero-title">{theme.title}</p>
					</div>

					{/* 场景信息 */}
					<div className="scene-info">
						<h4>📍 {sceneName}</h4>
						{sceneDescription && <p className="scene-desc">{sceneDescription}</p>}
					</div>

					{/* 分项星级 */}
					<div className="score-items">
						<div className="score-item">
							<div className="item-icon"><BookOpen size={16} /></div>
							<span className="item-label">词汇运用</span>
							<StarRating score={evaluation.vocabularyScore} size={14} />
						</div>
						<div className="score-item">
							<div className="item-icon"><Sparkles size={16} /></div>
							<span className="item-label">语法准确</span>
							<StarRating score={evaluation.grammarScore} size={14} />
						</div>
						<div className="score-item">
							<div className="item-icon"><MessageCircle size={16} /></div>
							<span className="item-label">交流能力</span>
							<StarRating score={evaluation.communicationScore} size={14} />
						</div>
						<div className="score-item">
							<div className="item-icon"><Trophy size={16} /></div>
							<span className="item-label">努力程度</span>
							<StarRating score={evaluation.effortScore} size={14} />
						</div>
					</div>
				</div>

				{/* 右侧：反馈内容 */}
				<div className="eval-right">
					{/* 老师评语 */}
					<div className="feedback-main">
						<h4>💬 老师说</h4>
						<p>{evaluation.feedback}</p>
					</div>

					{/* 优点 */}
					{evaluation.strengths.length > 0 && (
						<div className="feedback-section strengths">
							<h4>✨ 亮点</h4>
							<ul>
								{evaluation.strengths.map((s, i) => (
									<li key={i}>{s}</li>
								))}
							</ul>
						</div>
					)}

					{/* 建议 */}
					{evaluation.improvements.length > 0 && (
						<div className="feedback-section improvements">
							<h4>💡 小建议</h4>
							<ul>
								{evaluation.improvements.map((s, i) => (
									<li key={i}>{s}</li>
								))}
							</ul>
						</div>
					)}
				</div>
			</div>

			{/* 底部按钮 */}
			<div className="eval-actions">
				<button className="action-btn secondary" onClick={() => navigate(`/scenes/${sceneId}`)}>
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

