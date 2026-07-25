const PROMO_KEYWORDS = [
  'buy now', 'check out', 'link in', 'affiliate', 'discount',
  'coupon', 'deal', 'sale', 'offer', 'limited time',
  'order now', 'shop now', 'use code', 'promo', 'free shipping',
];

const DISCUSSION_KEYWORDS = [
  'how do i', 'how to', 'does anyone know', 'recommend',
  'struggling with', 'help me', 'what do you', 'advice',
  'suggestion', 'tip', 'trick', 'mistake', 'error',
  'problem', 'issue', 'fix', 'solution', 'learn',
];

const STORY_KEYWORDS = [
  'my experience', 'i tried', 'before and after', 'journey',
  'story', 'journey', 'transform', 'changed', 'result',
  'outcome', 'i started', 'here is what', 'what happened',
];

const QUESTION_KEYWORDS = [
  'what is', 'which', 'anyone', 'who', 'where',
  'when', 'why', 'how', '?',
];

function countKeywords(text, keywords) {
  const lower = text.toLowerCase();
  return keywords.filter((k) => lower.includes(k)).length;
}

export function classifyPost(post) {
  const text = `${post.title} ${post.selftext || ''}`;

  let promoHits = countKeywords(text, PROMO_KEYWORDS);
  if (post.domain && !post.isSelf && !post.domain.includes('reddit')) {
    promoHits += 1;
  }
  if (post.flair && /deal|offer|sale|promo/i.test(post.flair)) {
    promoHits += 2;
  }

  const promoScore = Math.min(100, Math.round((promoHits / 4) * 100));

  const educationalHits = countKeywords(text, DISCUSSION_KEYWORDS);
  const educationalScore = Math.min(100, Math.round((educationalHits / 3) * 100));

  const storyHits = countKeywords(text, STORY_KEYWORDS);
  const storyScore = Math.min(100, Math.round((storyHits / 2) * 100));

  const questionHits = countKeywords(text, QUESTION_KEYWORDS);
  const hasQuestionPattern = questionHits >= 2;
  const highCommentRatio = post.numComments > 0 && post.score > 0 &&
    (post.numComments / post.score) > 0.3;
  const interactiveScore = (hasQuestionPattern && highCommentRatio) ? 80 :
    hasQuestionPattern ? 50 : highCommentRatio ? 40 : 10;

  return { promoScore, educationalScore, storyScore, interactiveScore };
}

export function computeTrafficLight(posts) {
  if (!posts || posts.length === 0) {
    return { color: 'gray', label: 'بيانات غير كافية', details: {} };
  }

  const classified = posts.map((p) => ({
    ...p,
    ...classifyPost(p),
  }));

  const totalPosts = classified.length;
  const promoPosts = classified.filter((p) => p.promoScore >= 60).length;
  const promoRatio = promoPosts / totalPosts;

  const avgComments = classified.reduce((s, p) => s + p.numComments, 0) / totalPosts;
  const avgScore = classified.reduce((s, p) => s + p.score, 0) / totalPosts;
  const avgEngagement = (avgComments + avgScore) / 2;

  const highEngagement = avgEngagement > 20;

  let color, label;
  if (promoRatio <= 0.01 && highEngagement) {
    color = 'green';
    label = 'فرصة نظيفة - أقوى إشارة';
  } else if (promoRatio <= 0.15 && highEngagement) {
    color = 'yellow';
    label = 'سوق مصدّق ومفتوح';
  } else if (promoRatio > 0.4) {
    color = 'red';
    label = 'سوق مشبع بالترويج';
  } else if (!highEngagement && promoRatio <= 0.15) {
    color = 'yellow';
    label = 'تفاعل متوسط - يحتاج تحقق';
  } else {
    color = 'yellow';
    label = 'حالة متوسطة';
  }

  const educational = classified.filter((p) => p.educationalScore >= 60).length;
  const stories = classified.filter((p) => p.storyScore >= 60).length;
  const interactive = classified.filter((p) => p.interactiveScore >= 60).length;

  return {
    color,
    label,
    details: {
      totalPosts,
      promoPosts,
      promoRatio: Math.round(promoRatio * 100),
      avgComments: Math.round(avgComments),
      avgScore: Math.round(avgScore),
      avgEngagement: Math.round(avgEngagement),
      educational,
      stories,
      interactive,
      classified,
    },
  };
}
