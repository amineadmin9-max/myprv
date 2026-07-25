import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { fetchLocalData, searchReddit } from '../services/reddit';
import { computeTrafficLight } from '../services/scoring';

const SEED_SUGGESTIONS = [
  'budget travel', 'home gym', 'meal prep', 'pet care',
  'remote work', 'solar energy', 'mental health', 'coding bootcamp',
  'baby products', 'car maintenance', 'freelancing', 'photography',
];

export default function HomeScreen({ navigation }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [mode, setMode] = useState('manual');
  const [autoSources, setAutoSources] = useState({ trends: true, reddit: true });
  const [generatedIdeas, setGeneratedIdeas] = useState([]);
  const [selectedIdeas, setSelectedIdeas] = useState([]);
  const [generating, setGenerating] = useState(false);

  const analyzeSubreddit = async (subName) => {
    setStatus(`جاري تحليل r/${subName}...`);

    let posts = await fetchLocalData(subName);
    if (posts.length === 0) {
      setStatus(`سحب البيانات من r/${subName}...`);
      posts = await searchReddit(subName, 50);
    }

    if (posts.length === 0) return null;

    const scoring = computeTrafficLight(posts);
    return { name: subName, scoring, posts, subscribers: 0 };
  };

  const fetchGoogleTrends = async () => {
    try {
      const response = await fetch(
        'https://trends.google.com/trends/api/dailytrends?hl=en-US&tz=-480&geo=US'
      );
      const text = await response.text();
      const data = JSON.parse(text);
      const trends = data.default?.trendingSearchesDays?.[0]?.trendingSearches || [];
      return trends.slice(0, 15).map(t => ({
        title: t.title.query,
        traffic: t.formattedTraffic,
        source: 'Google Trends',
        related: (t.relatedQueries || []).map(q => q.query).slice(0, 3)
      }));
    } catch(e) {
      console.error('Google Trends error:', e);
      return [];
    }
  };

  const fetchRedditUnmetDemand = async () => {
    const queries = [
      'does anyone know a product',
      'looking for a product that',
      'wish there was a product',
      'is there a product for',
      'anyone recommend a product',
      'need help finding a product',
      'looking for something that',
      'does anyone use a product'
    ];
    
    const allIdeas = [];
    const seen = new Set();
    
    for (const query of queries.slice(0, 4)) {
      try {
        const posts = await searchReddit(query, 25);
        for (const post of posts) {
          if (!seen.has(post.title)) {
            seen.add(post.title);
            allIdeas.push({
              title: post.title,
              subreddit: post.subreddit,
              url: post.url,
              source: 'Reddit Unmet Demand'
            });
          }
        }
      } catch(e) { continue; }
    }
    
    return allIdeas.slice(0, 20);
  };

  const fetchAutoIdeas = async () => {
    const sources = Object.entries(autoSources).filter(([_, v]) => v).map(([k]) => k);
    if (sources.length === 0) {
      Alert.alert('تنبيه', 'اختر مصدر واحد على الأقل');
      return;
    }

    setGenerating(true);
    setStatus('جاري جمع الأفكار من المصادر المحددة...');

    try {
      const promises = [];
      if (sources.includes('trends')) promises.push(fetchGoogleTrends());
      if (sources.includes('reddit')) promises.push(fetchRedditUnmetDemand());
      
      const results = await Promise.all(promises);
      const ideas = results.flat();
      setGeneratedIdeas(ideas);
      
      if (ideas.length === 0) {
        setStatus('ما لقينا أفكار حالياً. جرّب تغيير المصادر.');
      } else {
        setStatus(`لقينا ${ideas.length} فكرة! اختر ما تريد تحليله.`);
      }
    } catch(e) {
      setStatus('خطأ في جمع الأفكار: ' + e.message);
    }

    setGenerating(false);
  };

  const toggleIdeaSelection = (index) => {
    setSelectedIdeas(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const analyzeSelectedIdeas = async () => {
    if (selectedIdeas.length === 0) {
      Alert.alert('تنبيه', 'اختر فكرة واحدة على الأقل');
      return;
    }

    setLoading(true);
    setStatus(`جاري تحليل ${selectedIdeas.length} أفكار...`);

    try {
      const results = [];
      for (let i = 0; i < selectedIdeas.length; i++) {
        const idea = generatedIdeas[selectedIdeas[i]];
        const keyword = idea.title.split(' ').slice(0, 3).join(' ');
        setStatus(`جاري تحليل ${i + 1}/${selectedIdeas.length}: ${keyword}`);
        
        const posts = await searchReddit(keyword, 50);
        if (posts.length > 0) {
          const scoring = computeTrafficLight(posts);
          results.push({
            name: keyword,
            scoring,
            posts,
            subscribers: 0,
          });
        }
      }

      results.sort((a, b) => {
        const order = { green: 0, yellow: 1, red: 2, gray: 3 };
        return (order[a.scoring.color] || 3) - (order[b.scoring.color] || 3);
      });

      setStatus('');
      if (results.length > 0) {
        navigation.navigate('Results', { query: 'أفكار مولّدة', results });
      } else {
        Alert.alert('نتيجة', 'ما لقيناش نتائج لهالأفكار');
      }
    } catch(e) {
      Alert.alert('خطأ', e.message || 'مشكل غير متوقع');
      setStatus('');
    }
    setLoading(false);
  };

  const handleSearch = async (searchQuery) => {
    const q = searchQuery || query;
    if (!q.trim()) {
      Alert.alert('تنبيه', 'ادخل كلمة للبحث');
      return;
    }
    setLoading(true);
    setStatus('جاري البحث...');

    try {
      const subNames = q.split(/[\s,]+/).filter(Boolean);
      const results = [];

      for (const name of subNames) {
        const result = await analyzeSubreddit(name);
        if (result) results.push(result);
      }

      if (results.length === 0) {
        setStatus('بحث مباشر في Reddit...');
        const posts = await searchReddit(q, 50);
        if (posts.length > 0) {
          const scoring = computeTrafficLight(posts);
          results.push({
            name: q.replace(/\s+/g, ''),
            scoring,
            posts,
            subscribers: 0,
          });
        }
      }

      results.sort((a, b) => {
        const order = { green: 0, yellow: 1, red: 2, gray: 3 };
        return (order[a.scoring.color] || 3) - (order[b.scoring.color] || 3);
      });

      setStatus('');
      if (results.length > 0) {
        navigation.navigate('Results', { query: q, results });
      } else {
        Alert.alert('نتيجة', 'ما لقيناش نتائج - جرب موضوع آخر');
      }
    } catch (e) {
      Alert.alert('خطأ', e.message || 'مشكل غير متوقع');
      setStatus('');
    }
    setLoading(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Niche Finder</Text>
      <Text style={styles.subtitle}>ابحث عن نيتشات Affiliate رابحة</Text>

      <View style={styles.modeToggle}>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'manual' && styles.modeBtnActive]}
          onPress={() => setMode('manual')}
        >
          <Text style={[styles.modeBtnText, mode === 'manual' && styles.modeBtnTextActive]}>
            ✍️ فكرة مباشرة
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeBtn, mode === 'auto' && styles.modeBtnActive]}
          onPress={() => setMode('auto')}
        >
          <Text style={[styles.modeBtnText, mode === 'auto' && styles.modeBtnTextActive]}>
            🤖 توليد تلقائي
          </Text>
        </TouchableOpacity>
      </View>

      {mode === 'manual' ? (
        <>
          <TextInput
            style={styles.input}
            placeholder="مثال: home gym, pet care, solar energy..."
            placeholderTextColor="#666"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => handleSearch()}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={() => handleSearch()}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>بحث</Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.autoPanel}>
            <Text style={styles.autoPanelTitle}>🔥 مصادر توليد الأفكار</Text>
            <Text style={styles.autoPanelDesc}>اختر المصدر لإيجاد أفكار نيتشات واعدة تلقائياً:</Text>
            <View style={styles.sourceChips}>
              <TouchableOpacity
                style={[styles.sourceChip, autoSources.trends && styles.sourceChipSelected]}
                onPress={() => setAutoSources(prev => ({ ...prev, trends: !prev.trends }))}
              >
                <Text style={[styles.sourceChipText, autoSources.trends && styles.sourceChipTextSelected]}>
                  📈 Google Trends
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.sourceChip, autoSources.reddit && styles.sourceChipSelected]}
                onPress={() => setAutoSources(prev => ({ ...prev, reddit: !prev.reddit }))}
              >
                <Text style={[styles.sourceChipText, autoSources.reddit && styles.sourceChipTextSelected]}>
                  🔍 Reddit Unmet Demand
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {generatedIdeas.length > 0 && (
            <View style={styles.autoPanel}>
              <Text style={styles.autoPanelTitle}>💡 أفكار مولّدة</Text>
              <ScrollView style={styles.trendingList} nestedScrollEnabled>
                {generatedIdeas.map((idea, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[styles.trendingItem, selectedIdeas.includes(index) && styles.trendingItemSelected]}
                    onPress={() => toggleIdeaSelection(index)}
                  >
                    <Text style={styles.trendingItemTitle}>{idea.title}</Text>
                    <Text style={styles.trendingItemSource}>
                      {idea.source}{idea.subreddit ? ` · r/${idea.subreddit}` : ''}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity
                style={[styles.generateBtn, loading && styles.buttonDisabled]}
                onPress={analyzeSelectedIdeas}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>تحليل المحدد</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity
            style={[styles.generateBtn, generating && styles.buttonDisabled]}
            onPress={fetchAutoIdeas}
            disabled={generating}
          >
            {generating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>توليد أفكار</Text>
            )}
          </TouchableOpacity>
        </>
      )}

      {status ? <Text style={styles.status}>{status}</Text> : null}

      {mode === 'manual' && (
        <>
          <Text style={styles.sectionTitle}>أفكار للبحث:</Text>
          <View style={styles.seedsContainer}>
            {SEED_SUGGESTIONS.map((seed) => (
              <TouchableOpacity
                key={seed}
                style={styles.seedChip}
                onPress={() => { setQuery(seed); handleSearch(seed); }}
              >
                <Text style={styles.seedText}>{seed}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <View style={styles.legend}>
        <Text style={styles.legendTitle}>دليل الألوان:</Text>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#22c55e' }]} />
          <Text style={styles.legendText}>أخضر - فرصة نظيفة (0% ترويج + تفاعل عالي)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#eab308' }]} />
          <Text style={styles.legendText}>أصفر - سوق مصدّق (ترويج قليل + تفاعل عالي)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#ef4444' }]} />
          <Text style={styles.legendText}>أحمر - مشبع (>40% ترويج)</Text>
        </View>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>كيفاش كيخدم؟</Text>
        <Text style={styles.infoText}>
          1. ادخل اسم مجال (مثلا: home gym){'\n'}
          2. الأداة كتجمع بوستات من Reddit{'\n'}
          3. كتحلل نسبة الترويج + التفاعل{'\n'}
          4. كتعرض النتائج مع أمثلة حقيقية
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 20, paddingTop: 60, paddingBottom: 50 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#f8fafc', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#94a3b8', textAlign: 'center', marginBottom: 30 },
  input: {
    backgroundColor: '#1e293b', borderRadius: 12, padding: 16,
    fontSize: 16, color: '#f8fafc', borderWidth: 1, borderColor: '#334155',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#3b82f6', borderRadius: 12, padding: 16,
    alignItems: 'center', marginBottom: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  status: { color: '#94a3b8', textAlign: 'center', marginBottom: 20, fontSize: 13 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#e2e8f0', marginBottom: 12, marginTop: 10 },
  seedsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 30 },
  seedChip: {
    backgroundColor: '#1e293b', borderRadius: 20, paddingHorizontal: 14,
    paddingVertical: 8, borderWidth: 1, borderColor: '#334155',
  },
  seedText: { color: '#94a3b8', fontSize: 13 },
  legend: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 16 },
  legendTitle: { fontSize: 16, fontWeight: 'bold', color: '#e2e8f0', marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  legendText: { color: '#94a3b8', fontSize: 13, flex: 1 },
  infoBox: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16 },
  infoTitle: { fontSize: 16, fontWeight: 'bold', color: '#e2e8f0', marginBottom: 8 },
  infoText: { color: '#94a3b8', fontSize: 13, lineHeight: 20 },
  modeToggle: { flexDirection: 'row', gap: 8, marginBottom: 15 },
  modeBtn: {
    flex: 1, padding: 12, borderRadius: 12, borderWidth: 2,
    borderColor: '#334155', backgroundColor: '#1e293b', alignItems: 'center',
  },
  modeBtnActive: { borderColor: '#3b82f6', backgroundColor: '#1e3a5f' },
  modeBtnText: { color: '#94a3b8', fontSize: 14, fontWeight: 'bold' },
  modeBtnTextActive: { color: '#f8fafc' },
  autoPanel: {
    backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 15,
  },
  autoPanelTitle: { fontSize: 14, fontWeight: 'bold', color: '#3b82f6', marginBottom: 10 },
  autoPanelDesc: { fontSize: 12, color: '#94a3b8', marginBottom: 10, lineHeight: 18 },
  sourceChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sourceChip: {
    backgroundColor: '#0f172a', borderRadius: 20, paddingHorizontal: 12,
    paddingVertical: 6, borderWidth: 1, borderColor: '#334155',
  },
  sourceChipSelected: { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
  sourceChipText: { fontSize: 12, color: '#94a3b8' },
  sourceChipTextSelected: { color: '#fff' },
  trendingList: { maxHeight: 200, marginBottom: 10 },
  trendingItem: {
    backgroundColor: '#0f172a', borderRadius: 8, padding: 12, marginBottom: 6,
  },
  trendingItemSelected: { backgroundColor: '#1e3a5f', borderColor: '#3b82f6' },
  trendingItemTitle: { fontSize: 13, color: '#f8fafc', marginBottom: 4 },
  trendingItemSource: { fontSize: 10, color: '#64748b' },
  generateBtn: {
    backgroundColor: '#3b82f6', borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 10,
  },
});
