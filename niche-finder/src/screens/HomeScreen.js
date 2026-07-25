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

      {status ? <Text style={styles.status}>{status}</Text> : null}

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
});
