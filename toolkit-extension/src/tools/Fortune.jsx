import { useState, useEffect, useMemo } from 'react';
import './Fortune.css';

// Fortune messages organized by category
const FORTUNES = {
  overall: [
    '오늘은 새로운 시작에 좋은 날입니다. 계획했던 일을 실행에 옮겨보세요.',
    '차분하게 하루를 보내면 좋은 결과가 있을 것입니다.',
    '예상치 못한 좋은 소식이 들려올 수 있습니다.',
    '주변 사람들과의 소통이 중요한 날입니다.',
    '오래 미뤄왔던 일을 처리하기 좋은 날입니다.',
    '작은 것에서 행복을 찾을 수 있는 날입니다.',
    '자신감을 가지고 도전하면 성공할 수 있습니다.',
    '휴식이 필요한 날입니다. 무리하지 마세요.',
    '창의적인 아이디어가 떠오를 수 있는 날입니다.',
    '감사하는 마음으로 하루를 시작해보세요.',
    '긍정적인 에너지가 가득한 날입니다.',
    '중요한 결정은 신중하게 하세요.',
    '오늘 하는 노력이 미래에 큰 결실을 맺을 것입니다.',
    '마음의 여유를 가지면 좋은 일이 생깁니다.',
    '새로운 인연을 만날 수 있는 날입니다.',
  ],
  work: [
    '업무에서 큰 성과를 낼 수 있습니다.',
    '동료와의 협업이 좋은 결과를 가져옵니다.',
    '집중력이 높아지는 시간입니다.',
    '새로운 프로젝트 시작에 좋습니다.',
    '꼼꼼한 검토가 필요한 날입니다.',
  ],
  relationship: [
    '소중한 사람에게 연락해보세요.',
    '주변 사람들의 조언을 귀담아 들어보세요.',
    '오해가 있었다면 풀어보세요.',
    '함께하는 시간이 행복을 가져다줍니다.',
    '진심을 전하면 좋은 결과가 있습니다.',
  ],
  health: [
    '충분한 수면이 필요합니다.',
    '가벼운 운동으로 하루를 시작해보세요.',
    '식단 관리에 신경 쓰면 좋겠습니다.',
    '스트레스 관리에 주의하세요.',
    '물을 충분히 마시세요.',
  ],
};

const LUCKY_ITEMS = [
  '파란색', '녹색', '노란색', '흰색', '보라색',
  '커피', '차', '물', '과일', '책',
  '음악', '산책', '명상', '운동', '독서',
  '동쪽', '서쪽', '남쪽', '북쪽',
  '숫자 3', '숫자 7', '숫자 8', '숫자 9',
];

function Fortune() {
  const [fortune, setFortune] = useState(null);

  // Generate deterministic random based on date
  const seedRandom = (seed) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  const todayFortune = useMemo(() => {
    const today = new Date();
    const seed = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();

    const getRandomItem = (arr, offset = 0) => {
      const index = Math.floor(seedRandom(seed + offset) * arr.length);
      return arr[index];
    };

    return {
      overall: getRandomItem(FORTUNES.overall, 1),
      work: getRandomItem(FORTUNES.work, 2),
      relationship: getRandomItem(FORTUNES.relationship, 3),
      health: getRandomItem(FORTUNES.health, 4),
      luckyColor: getRandomItem(['파란색', '녹색', '노란색', '흰색', '보라색', '빨간색', '주황색'], 5),
      luckyNumber: Math.floor(seedRandom(seed + 6) * 99) + 1,
      luckyItem: getRandomItem(LUCKY_ITEMS, 7),
      score: Math.floor(seedRandom(seed + 8) * 40) + 60, // 60-99
    };
  }, []);

  useEffect(() => {
    setFortune(todayFortune);
  }, [todayFortune]);

  if (!fortune) {
    return (
      <div className="fortune-loading">
        <span>운세 로딩 중...</span>
      </div>
    );
  }

  const getScoreEmoji = (score) => {
    if (score >= 90) return '🌟';
    if (score >= 80) return '✨';
    if (score >= 70) return '💫';
    return '⭐';
  };

  return (
    <div className="fortune">
      <div className="fortune-score">
        <span className="score-emoji">{getScoreEmoji(fortune.score)}</span>
        <span className="score-value">{fortune.score}점</span>
        <span className="score-label">오늘의 운</span>
      </div>

      <div className="fortune-message">
        <p>{fortune.overall}</p>
      </div>

      <div className="fortune-details">
        <div className="fortune-item">
          <span className="fortune-icon">💼</span>
          <span className="fortune-text">{fortune.work}</span>
        </div>
        <div className="fortune-item">
          <span className="fortune-icon">💝</span>
          <span className="fortune-text">{fortune.relationship}</span>
        </div>
        <div className="fortune-item">
          <span className="fortune-icon">💪</span>
          <span className="fortune-text">{fortune.health}</span>
        </div>
      </div>

      <div className="fortune-lucky">
        <div className="lucky-item">
          <span className="lucky-label">행운의 색</span>
          <span className="lucky-value">{fortune.luckyColor}</span>
        </div>
        <div className="lucky-item">
          <span className="lucky-label">행운의 숫자</span>
          <span className="lucky-value">{fortune.luckyNumber}</span>
        </div>
        <div className="lucky-item">
          <span className="lucky-label">행운의 아이템</span>
          <span className="lucky-value">{fortune.luckyItem}</span>
        </div>
      </div>
    </div>
  );
}

export default Fortune;
