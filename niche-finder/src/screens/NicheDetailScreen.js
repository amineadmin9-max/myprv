import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, Linking, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { getRelatedSubreddits } from '../services/reddit';
import { classifyPost } from '../services/scoring';

const COLOR_MAP = {
  green: { bg: '#052e16', border: '#22c55e', text: '#4ade80', label: '🟢 أخضر' },
  yellow: { bg: '#422006', border: '#eab308', text: '#facc15', label: '🟡 أصفر' },
  red: { bg: '#450a0a', border: '#ef4444', text: '#f87171', label: '🔴 أحمر' },
};

const PILLAR_LABELS = { educational: 'تعليمي', story: 'قصة', interactive: 'تفاعلي' };

export default function NicheDetailScreen({ route }) {
  const { niche } = route.params;
  const [related, setRelated] = useState([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  const colorInfo = COLOR_MAP[niche.scoring.color] || COLOR_MAP.gray;
  const d = niche.scoring.details;
  const classified = d.classified || [];

  useEffect(() => {
    (async () => {
      setLoadingRelated(true);
      const subs = await getRelatedSubreddits(niche.name);
      setRelated(subs);
      setLoadingRelated(false);
    })();
  }, []);

  const topEducational = classified
    .filter((p) => p.educationalScore >= 50)
    .sort((a, b) => b.educationalScore - a.educationalScore)
    .slice(0, 5);

  const topStories = classified
    .filter((p) => p.storyScore >= 50)
    .sort((a, b) => b.storyScore - a.storyScore)
    .slice(0, 5);

  const topInteractive = classified
    .filter((p) => p.interactiveScore >= 50)
    .sort((a, b) => b.interactiveScore - a.interactiveScore)
    .slice(0, 5);

  const renderPost = ({ item }) => {
    const cls = classifyPost(item);
    return (
      <TouchableOpacity style={styles.postCard} onPress={() => Linking.openURL(item.permalink)}>
        <Text style={styles.postTitle} numberOfLines={2}>{item.title}</Text>
        <View style={styles.postStats}>
          <Text style={styles.postStat}>⬆ {item.score}</Text>
          <Text style={styles.postStat}>💬 {item.numComments}</Text>
        </View>
        <View style={styles.pillarTags}>
          {cls.promoScore >= 60 && <View style={[styles.pillTag, { backgroundColor: '#450a0a' }]}><Text style={[styles.pillText, { color: '#f87171' }]}>ترويجي {cls.promoScore}%</Text></View>}
          {cls.educationalScore >= 50 && <View style={[styles.pillTag, { backgroundColor: '#1e3a5f' }]}><Text style={[styles.pillText, { color: '#60a5fa' }]}>تعليمي {cls.educationalScore}%</Text></View>}
          {cls.storyScore >= 50 && <View style={[styles.pillTag, { backgroundColor: '#1a2e05' }]}><Text style={[styles.pillText, { color: '#86efac' }]}>قصة {cls.storyScore}%</Text></View>}
          {cls.interactiveScore >= 50 && <View style={[styles.pillTag, { backgroundColor: '#3b1f6e' }]}><Text style={[styles.pillText, { color: '#c084fc' }]}>تفاعلي {cls.interactiveScore}%</Text></View>}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSection = (title, data) => {
    if (data.length === 0) return null;
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{title} ({data.length})</Text>
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={renderPost}
          scrollEnabled={false}
        />
      </View>
    );
  };

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={[{ key: 'content' }]}
      renderItem={() => (
        <>
          <View style={[styles.headerCard, { borderColor: colorInfo.border }]}>
            <Text style={styles.title}>r/{niche.name}</Text>
            <View style={[styles.badge, { backgroundColor: colorInfo.bg }]}>
              <Text style={[styles.badgeText, { color: colorInfo.text }]}>{colorInfo.label}</Text>
            </View>
            <Text style={styles.label}>{niche.scoring.label}</Text>
          </View>

          <View style={styles.statsGrid}>
            <View style={styles.statBox}><Text style={styles.statVal}>{d.totalPosts}</Text><Text style={styles.statLbl}>بوستات</Text></View>
            <View style={styles.statBox}><Text style={styles.statVal}>{d.avgComments}</Text><Text style={styles.statLbl}>تعليقات/بوست</Text></View>
            <View style={styles.statBox}><Text style={styles.statVal}>{d.avgScore}</Text><Text style={styles.statLbl}>score/بوست</Text></View>
            <View style={styles.statBox}><Text style={styles.statVal}>{d.promoRatio}%</Text><Text style={styles.statLbl}>نسبة الترويج</Text></View>
          </View>

          <View style={styles.contentPillars}>
            <Text style={styles.sectionTitle}>أعمدة المحتوى:</Text>
            <View style={styles.pillarRow}>
              <View style={styles.pillar}><Text style={styles.pillarNum}>{d.educational}</Text><Text style={styles.pillarLabel}>تعليمي</Text></View>
              <View style={styles.pillar}><Text style={styles.pillarNum}>{d.stories}</Text><Text style={styles.pillarLabel}>قصص</Text></View>
              <View style={styles.pillar}><Text style={styles.pillarNum}>{d.interactive}</Text><Text style={styles.pillarLabel}>تفاعلي</Text></View>
            </View>
          </View>

          {renderSection('أفضل بوستات تعليمية', topEducational)}
          {renderSection('أفضل قصص وتجارب', topStories)}
          {renderSection('أفضل أسئلة تفاعلية', topInteractive)}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Subreddits ذات صلة:</Text>
            {loadingRelated ? (
              <ActivityIndicator color="#3b82f6" style={{ marginTop: 10 }} />
            ) : (
              related.map((r) => (
                <TouchableOpacity key={r.name} style={styles.relatedItem} onPress={() => Linking.openURL(`https://reddit.com/r/${r.name}`)}>
                  <Text style={styles.relatedName}>r/{r.name}</Text>
                  <Text style={styles.relatedDesc} numberOfLines={1}>{r.title}</Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </>
      )}
      keyExtractor={() => 'content'}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  content: { padding: 20, paddingBottom: 50 },
  headerCard: { backgroundColor: '#1e293b', borderRadius: 16, padding: 20, borderWidth: 2, marginBottom: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#f8fafc', marginBottom: 8 },
  badge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5, marginBottom: 8 },
  badgeText: { fontSize: 14, fontWeight: 'bold' },
  label: { fontSize: 14, color: '#94a3b8' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 20 },
  statBox: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, width: '48%', marginBottom: 10, alignItems: 'center' },
  statVal: { fontSize: 22, fontWeight: 'bold', color: '#f8fafc' },
  statLbl: { fontSize: 12, color: '#64748b', marginTop: 4 },
  contentPillars: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#e2e8f0', marginBottom: 12 },
  pillarRow: { flexDirection: 'row', justifyContent: 'space-around' },
  pillar: { alignItems: 'center' },
  pillarNum: { fontSize: 28, fontWeight: 'bold', color: '#3b82f6' },
  pillarLabel: { fontSize: 13, color: '#94a3b8', marginTop: 4 },
  section: { marginBottom: 20 },
  postCard: { backgroundColor: '#1e293b', borderRadius: 12, padding: 14, marginBottom: 10 },
  postTitle: { fontSize: 14, color: '#e2e8f0', marginBottom: 8, lineHeight: 20 },
  postStats: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  postStat: { fontSize: 12, color: '#94a3b8' },
  pillarTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pillTag: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 11, fontWeight: 'bold' },
  relatedItem: { backgroundColor: '#1e293b', borderRadius: 10, padding: 12, marginBottom: 8 },
  relatedName: { fontSize: 15, fontWeight: 'bold', color: '#60a5fa' },
  relatedDesc: { fontSize: 13, color: '#94a3b8', marginTop: 4 },
});
