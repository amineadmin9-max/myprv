import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { searchSubreddits, getSubredditPosts } from '../services/reddit';
import { computeTrafficLight } from '../services/scoring';

const SEED_SUGGESTIONS = [
  'budget travel', 'home gym', 'meal prep', 'pet care',
  'remote work', 'solar energy', 'mental health', 'coding bootcamp',
  'baby products', 'car maintenance', 'freelancing', 'photography tips',
];

export default function HomeScreen({ navigation }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSearch = async (searchQuery) => {
    const q = searchQuery || query;
    if (!q.trim()) {
      Alert.alert('تنبيه', 'ادخل كلمة للبحث');
      return;
    }
    setLoading(true);
    try {
      const subreddits = await searchSubreddits(q, 10);
      if (subreddits.length === 0) {
        Alert.alert('نتيجة', 'ما لقيناش subreddits لهذا الموضوع');
        setLoading(false);
        return;
      }
      const results = [];
      for (const sub of subreddits.slice(0, 5)) {
        const posts = await getSubredditPosts(sub.name, 'hot', 50);
        const scoring = computeTrafficLight(posts);
        results.push({ ...sub, scoring, posts });
      }
      results.sort((a, b) => {
        const order = { green: 0, yellow: 1, red: 2, gray: 3 };
        return (order[a.scoring.color] || 3) - (order[b.scoring.color] || 3);
      });
      navigation.navigate('Results', { query: q, results });
    } catch (e) {
      Alert.alert('خطأ', 'مشكل في الاتصال بـ Reddit');
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
        placeholderTextColor="#999"
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => handleSearch()}
      />

      <TouchableOpacity
        style={styles.button}
        onPress={() => handleSearch()}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>بحث</Text>
        )}
      </TouchableOpacity>

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
          <Text style={styles.legendText}>أخضر - فرصة نظيفة</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#eab308' }]} />
          <Text style={styles.legendText}>أصفر - سوق مصدّق</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#ef4444' }]} />
          <Text style={styles.legendText}>أحمر - مشبع بالترويج</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 20, paddingTop: 60 },
  title: { fontSize: 32, fontWeight: 'bold', color: '#f8fafc', textAlign: 'center' },
  subtitle: { fontSize: 16, color: '#94a3b8', textAlign: 'center', marginBottom: 30 },
  input: {
    backgroundColor: '#1e293b', borderRadius: 12, padding: 16,
    fontSize: 16, color: '#f8fafc', borderWidth: 1, borderColor: '#334155',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#3b82f6', borderRadius: 12, padding: 16,
    alignItems: 'center', marginBottom: 30,
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#e2e8f0', marginBottom: 12 },
  seedsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 30 },
  seedChip: {
    backgroundColor: '#1e293b', borderRadius: 20, paddingHorizontal: 14,
    paddingVertical: 8, borderWidth: 1, borderColor: '#334155',
  },
  seedText: { color: '#94a3b8', fontSize: 13 },
  legend: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16 },
  legendTitle: { fontSize: 16, fontWeight: 'bold', color: '#e2e8f0', marginBottom: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  dot: { width: 12, height: 12, borderRadius: 6, marginRight: 10 },
  legendText: { color: '#94a3b8', fontSize: 14 },
});
