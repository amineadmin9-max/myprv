import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';

const COLOR_MAP = {
  green: { bg: '#052e16', border: '#22c55e', text: '#4ade80', label: '🟢 أخضر' },
  yellow: { bg: '#422006', border: '#eab308', text: '#facc15', label: '🟡 أصفر' },
  red: { bg: '#450a0a', border: '#ef4444', text: '#f87171', label: '🔴 أحمر' },
  gray: { bg: '#1e293b', border: '#64748b', text: '#94a3b8', label: '⚪ غير محدد' },
};

export default function ResultsScreen({ route, navigation }) {
  const { query, results } = route.params;

  const renderNiche = ({ item }) => {
    const colorInfo = COLOR_MAP[item.scoring.color] || COLOR_MAP.gray;
    const d = item.scoring.details;

    return (
      <TouchableOpacity
        style={[styles.card, { borderColor: colorInfo.border }]}
        onPress={() => navigation.navigate('NicheDetail', { niche: item })}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>r/{item.name}</Text>
          <View style={[styles.badge, { backgroundColor: colorInfo.bg }]}>
            <Text style={[styles.badgeText, { color: colorInfo.text }]}>
              {colorInfo.label}
            </Text>
          </View>
        </View>

        <Text style={styles.cardSubtitle}>{item.scoring.label}</Text>

        <View style={styles.statsRow}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{d.totalPosts || 0}</Text>
            <Text style={styles.statLabel}>بوستات</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{d.avgComments || 0}</Text>
            <Text style={styles.statLabel}>تعليقات متوسط</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{d.promoRatio || 0}%</Text>
            <Text style={styles.statLabel}>ترويج</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{d.educational || 0}</Text>
            <Text style={styles.statLabel}>تعليمي</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{d.stories || 0}</Text>
            <Text style={styles.statLabel}>قصص</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{d.interactive || 0}</Text>
            <Text style={styles.statLabel}>تفاعلي</Text>
          </View>
        </View>

        <Text style={styles.viewDetail}>اضغط للتفاصيل ←</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>نتائج البحث: "{query}"</Text>
      <FlatList
        data={results}
        keyExtractor={(item) => item.name}
        renderItem={renderNiche}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>ما لقيناش نتائج</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  header: { fontSize: 20, fontWeight: 'bold', color: '#f8fafc', padding: 20, paddingBottom: 10 },
  list: { padding: 20, paddingTop: 10 },
  card: {
    backgroundColor: '#1e293b', borderRadius: 16, padding: 18,
    marginBottom: 14, borderWidth: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#f8fafc' },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 13, fontWeight: 'bold' },
  cardSubtitle: { fontSize: 14, color: '#94a3b8', marginBottom: 14 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  stat: { alignItems: 'center', width: '15%', marginBottom: 8 },
  statValue: { fontSize: 18, fontWeight: 'bold', color: '#f8fafc' },
  statLabel: { fontSize: 10, color: '#64748b', marginTop: 2 },
  viewDetail: { fontSize: 13, color: '#3b82f6', textAlign: 'left', marginTop: 10 },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 50, fontSize: 16 },
});
