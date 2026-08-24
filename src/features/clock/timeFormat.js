const ENGLISH_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ENGLISH_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function padTime(value) {
  return String(value).padStart(2, '0');
}

export function formatClockDate(date) {
  return `${ENGLISH_DAYS[date.getDay()]}, ${ENGLISH_MONTHS[date.getMonth()]} ${date.getDate()}`;
}

export function getClockAngles(date) {
  const hour = date.getHours() % 12;
  const minute = date.getMinutes();
  const second = date.getSeconds();
  return {
    hour: hour * 30 + minute * 0.5,
    minute: minute * 6 + second * 0.1,
    second: second * 6,
  };
}

export function getTimeInWords(date, language = 'en') {
  const hour = date.getHours() % 12;
  const minute = date.getMinutes();

  if (language === 'ko') {
    const hours = ['열두', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉', '열', '열한'];
    const minutes = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구', '십',
      '십일', '십이', '십삼', '십사', '십오', '십육', '십칠', '십팔', '십구', '이십',
      '이십일', '이십이', '이십삼', '이십사', '이십오', '이십육', '이십칠', '이십팔', '이십구',
      '삼십', '삼십일', '삼십이', '삼십삼', '삼십사', '삼십오', '삼십육', '삼십칠', '삼십팔', '삼십구',
      '사십', '사십일', '사십이', '사십삼', '사십사', '사십오', '사십육', '사십칠', '사십팔', '사십구',
      '오십', '오십일', '오십이', '오십삼', '오십사', '오십오', '오십육', '오십칠', '오십팔', '오십구'];
    return minute === 0 ? ['지금', `${hours[hour]}시`, '정각'] : ['지금', `${hours[hour]}시`, `${minutes[minute]}분`];
  }

  if (language === 'ja') {
    const hours = ['十二', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一'];
    const ones = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    const tens = ['', '十', '二十', '三十', '四十', '五十'];
    return minute === 0
      ? ['今', `${hours[hour]}時`, 'ちょうど']
      : ['今', `${hours[hour]}時`, `${tens[Math.floor(minute / 10)]}${ones[minute % 10]}分`];
  }

  const hours = ['TWELVE', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN'];
  const ones = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
    'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
  const tens = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY'];
  const numberWord = (value) => value < 20
    ? ones[value]
    : `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${ones[value % 10]}` : ''}`;

  if (minute === 0) return ['IT IS', hours[hour], "O'CLOCK"];
  if (minute <= 30) return ['IT IS', numberWord(minute), minute === 30 ? 'HALF PAST' : 'PAST', hours[hour]];
  return ['IT IS', numberWord(60 - minute), 'TO', hours[(hour + 1) % 12]];
}
