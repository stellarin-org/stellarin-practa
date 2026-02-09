/**
 * Dates to Remember Practa
 * 
 * A personal date tracker where users explicitly add important dates.
 * Contacts import is just a discovery tool to find birthdays to add.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { View, StyleSheet, Pressable, Platform, SectionList, Linking, TextInput, ScrollView, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as Contacts from "expo-contacts";
import { Feather } from "@expo/vector-icons";

import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { useTheme } from "@/hooks/useTheme";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Spacing, BorderRadius } from "@/constants/theme";
import { PractaProps } from "@/types/flow";
import { usePractaChrome } from "@/context/PractaChromeContext";
import { useHeaderHeight } from "@/components/PractaChromeHeader";

interface SavedDate {
  id: string;
  name: string;
  month: number;
  day: number;
  year?: number;
  type: "birthday" | "anniversary" | "custom";
  phone?: string;
  email?: string;
}

interface ContactInfo {
  id: string;
  name: string;
  emails: string[];
  phoneNumbers: string[];
  month: number;
  day: number;
  year?: number;
}

interface DateSection {
  title: string;
  data: SavedDate[];
}

type PermissionStatus = "undetermined" | "granted" | "denied";

interface PermissionState {
  status: PermissionStatus;
  granted: boolean;
  canAskAgain: boolean;
}

type ViewMode = "list" | "import" | "add";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const DATE_TYPES = [
  { value: "birthday", label: "Birthday", icon: "gift", color: "#5B8DEF", bgColor: "#5B8DEF20" },
  { value: "anniversary", label: "Anniversary", icon: "heart", color: "#E85D75", bgColor: "#E85D7520" },
  { value: "custom", label: "Custom", icon: "calendar", color: "#6B7280", bgColor: "#6B728020" },
] as const;

function getTypeColors(type: string): { color: string; bgColor: string } {
  const typeConfig = DATE_TYPES.find(t => t.value === type);
  return typeConfig ? { color: typeConfig.color, bgColor: typeConfig.bgColor } : { color: "#6B7280", bgColor: "#6B728020" };
}

function getNextDate(month: number, day: number): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentYear = today.getFullYear();
  
  let dateThisYear = new Date(currentYear, month - 1, day);
  dateThisYear.setHours(0, 0, 0, 0);
  
  if (dateThisYear < today) {
    dateThisYear = new Date(currentYear + 1, month - 1, day);
  }
  
  return dateThisYear;
}

function getDateCategory(nextDate: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const date = new Date(nextDate);
  date.setHours(0, 0, 0, 0);
  
  const diffTime = date.getTime() - today.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return "Today";
  } else if (diffDays === 1) {
    return "Tomorrow";
  } else if (diffDays > 1 && diffDays <= 7) {
    return "This Week";
  } else if (diffDays > 7 && diffDays <= 14) {
    return "Next Week";
  }
  
  const currentMonth = today.getMonth();
  const dateMonth = date.getMonth();
  const currentYear = today.getFullYear();
  const dateYear = date.getFullYear();

  if (currentYear === dateYear && currentMonth === dateMonth) {
    return "This Month";
  }
  
  const nextMonthDate = new Date(today);
  nextMonthDate.setMonth(today.getMonth() + 1);
  const nextMonth = nextMonthDate.getMonth();
  const nextMonthYear = nextMonthDate.getFullYear();

  if (dateYear === nextMonthYear && dateMonth === nextMonth) {
    return "Next Month";
  }

  return MONTH_NAMES[dateMonth] + (dateYear !== currentYear ? ` ${dateYear}` : "");
}

function formatDateDisplay(month: number, day: number, year?: number): string {
  const monthName = MONTH_NAMES[month - 1];
  if (year) {
    return `${monthName} ${day}, ${year}`;
  }
  return `${monthName} ${day}`;
}

function getIconForType(type: SavedDate["type"]): string {
  switch (type) {
    case "birthday": return "gift";
    case "anniversary": return "heart";
    default: return "calendar";
  }
}

function getDaysInMonth(month: number): number {
  if (month === 2) return 29;
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

export default function MyPracta({ context, onComplete, onSettings, showSettings }: PractaProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { setConfig } = usePractaChrome();
  const headerHeight = useHeaderHeight();
  
  const [savedDates, setSavedDates] = useState<SavedDate[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [permission, setPermission] = useState<PermissionState | null>(null);
  const [contacts, setContacts] = useState<ContactInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStorageLoaded, setIsStorageLoaded] = useState(false);
  
  const [newDateName, setNewDateName] = useState("");
  const [newDateMonth, setNewDateMonth] = useState<number | null>(null);
  const [newDateDay, setNewDateDay] = useState("");
  const [newDateYear, setNewDateYear] = useState("");
  const [newDateType, setNewDateType] = useState<SavedDate["type"]>("birthday");
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const dayInputRef = useRef<TextInput>(null);
  const yearInputRef = useRef<TextInput>(null);

  const [editingDateId, setEditingDateId] = useState<string | null>(null);

  useEffect(() => {
    setConfig({
      headerMode: "default",
      title: "Dates to Remember",
      showSettings,
      onSettings,
    });
  }, [setConfig, showSettings, onSettings]);

  useEffect(() => {
    loadSavedDates();
  }, []);

  const generateDevSampleDates = (): SavedDate[] => {
    const today = new Date();
    const samples: SavedDate[] = [];
    
    const addDate = (daysOffset: number, name: string, type: SavedDate["type"]) => {
      const date = new Date(today);
      date.setDate(date.getDate() + daysOffset);
      samples.push({
        id: `sample-${daysOffset}-${name}`,
        name,
        month: date.getMonth() + 1,
        day: date.getDate(),
        type,
      });
    };
    
    addDate(0, "Mom's Birthday", "birthday");
    addDate(1, "Wedding Anniversary", "anniversary");
    addDate(3, "Best Friend's Birthday", "birthday");
    addDate(8, "Parent's Anniversary", "anniversary");
    addDate(18, "Sister's Birthday", "birthday");
    addDate(40, "College Reunion", "custom");
    addDate(75, "Nephew's Birthday", "birthday");
    addDate(120, "Work Anniversary", "anniversary");
    
    return samples;
  };

  const loadSavedDates = async () => {
    try {
      const stored = await context.storage?.get<SavedDate[]>("savedDates");
      if (stored && stored.length > 0) {
        setSavedDates(stored);
      } else if (__DEV__) {
        const sampleDates = generateDevSampleDates();
        setSavedDates(sampleDates);
        await context.storage?.set("savedDates", sampleDates);
      }
    } catch (error) {
      console.error("Error loading saved dates:", error);
    } finally {
      setIsStorageLoaded(true);
    }
  };

  const saveDates = async (dates: SavedDate[]) => {
    setSavedDates(dates);
    try {
      await context.storage?.set("savedDates", dates);
    } catch (error) {
      console.error("Error saving dates:", error);
    }
  };

  const checkPermission = async () => {
    const { status, canAskAgain } = await Contacts.getPermissionsAsync();
    setPermission({
      status: status as PermissionStatus,
      granted: status === "granted",
      canAskAgain: canAskAgain ?? true,
    });
    
    if (status === "granted") {
      fetchContacts();
    }
  };

  const requestPermission = async () => {
    const { status, canAskAgain } = await Contacts.requestPermissionsAsync();
    setPermission({
      status: status as PermissionStatus,
      granted: status === "granted",
      canAskAgain: canAskAgain ?? true,
    });
    
    if (status === "granted") {
      fetchContacts();
    }
  };

  const fetchContacts = async () => {
    setIsLoading(true);
    try {
      const { data } = await Contacts.getContactsAsync({
        fields: [
          Contacts.Fields.Emails,
          Contacts.Fields.PhoneNumbers,
          Contacts.Fields.Birthday,
        ],
      });

      const contactsWithBirthdays: ContactInfo[] = data
        .filter((contact: any) => contact.birthday?.month && contact.birthday?.day)
        .map((contact: any) => ({
          id: contact.id || Math.random().toString(),
          name: contact.name || "Unknown",
          emails: contact.emails?.map((e: any) => e.email || "").filter(Boolean) as string[] || [],
          phoneNumbers: contact.phoneNumbers?.map((p: any) => p.number || "").filter(Boolean) as string[] || [],
          month: contact.birthday!.month!,
          day: contact.birthday!.day!,
          year: contact.birthday?.year,
        }));

      contactsWithBirthdays.sort((a, b) => {
        const dateA = getNextDate(a.month, a.day);
        const dateB = getNextDate(b.month, b.day);
        return dateA.getTime() - dateB.getTime();
      });

      setContacts(contactsWithBirthdays);
    } catch (error) {
      console.error("Error fetching contacts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const sections = useMemo((): DateSection[] => {
    const grouped: Record<string, SavedDate[]> = {};
    const categoryOrder: string[] = [];

    const sortedDates = [...savedDates].sort((a, b) => {
      const dateA = getNextDate(a.month, a.day);
      const dateB = getNextDate(b.month, b.day);
      return dateA.getTime() - dateB.getTime();
    });

    sortedDates.forEach((date) => {
      const nextDate = getNextDate(date.month, date.day);
      const category = getDateCategory(nextDate);
      
      if (!grouped[category]) {
        grouped[category] = [];
        categoryOrder.push(category);
      }
      
      grouped[category].push(date);
    });

    return categoryOrder.map((title) => ({
      title,
      data: grouped[title],
    }));
  }, [savedDates]);

  const triggerHaptic = () => {
    if (Platform.OS !== "web") {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const handleAddFromContact = (contact: ContactInfo) => {
    triggerHaptic();
    
    const alreadyExists = savedDates.some(
      d => d.name === contact.name && d.month === contact.month && d.day === contact.day
    );
    
    if (alreadyExists) {
      return;
    }
    
    const newDate: SavedDate = {
      id: `${Date.now()}-${Math.random()}`,
      name: contact.name,
      month: contact.month,
      day: contact.day,
      year: contact.year,
      type: "birthday",
      phone: contact.phoneNumbers[0],
      email: contact.emails[0],
    };
    
    saveDates([...savedDates, newDate]);
  };

  const handleAddCustomDate = () => {
    triggerHaptic();
    
    const day = parseInt(newDateDay, 10);
    const year = newDateYear ? parseInt(newDateYear, 10) : undefined;
    
    if (!newDateName.trim()) {
      Alert.alert("Name Required", "Please enter a name for this date.");
      return;
    }
    
    if (!newDateMonth || newDateMonth < 1 || newDateMonth > 12) {
      Alert.alert("Month Required", "Please select a month.");
      return;
    }
    
    if (isNaN(day) || day < 1 || day > 31) {
      Alert.alert("Day Required", "Please enter a valid day (1-31).");
      return;
    }
    
    if (editingDateId) {
      const updatedDates = savedDates.map(d => 
        d.id === editingDateId 
          ? { ...d, name: newDateName.trim(), month: newDateMonth, day, year, type: newDateType }
          : d
      );
      saveDates(updatedDates);
    } else {
      const newDate: SavedDate = {
        id: `${Date.now()}-${Math.random()}`,
        name: newDateName.trim(),
        month: newDateMonth,
        day,
        year,
        type: newDateType,
      };
      saveDates([...savedDates, newDate]);
    }
    
    resetForm();
  };

  const resetForm = () => {
    setNewDateName("");
    setNewDateMonth(null);
    setNewDateDay("");
    setNewDateYear("");
    setNewDateType("birthday");
    setShowMonthPicker(false);
    setEditingDateId(null);
    setViewMode("list");
  };

  const handleEditDate = (date: SavedDate) => {
    triggerHaptic();
    setEditingDateId(date.id);
    setNewDateName(date.name);
    setNewDateMonth(date.month);
    setNewDateDay(date.day.toString());
    setNewDateYear(date.year?.toString() || "");
    setNewDateType(date.type);
    setViewMode("add");
  };

  const handleDayChange = (text: string) => {
    setNewDateDay(text);
    if (text.length === 2) {
      yearInputRef.current?.focus();
    }
  };

  const isFormValid = newDateName.trim() && newDateMonth && newDateDay && parseInt(newDateDay, 10) >= 1 && parseInt(newDateDay, 10) <= 31;

  const handleDeleteDate = (id: string) => {
    triggerHaptic();
    saveDates(savedDates.filter(d => d.id !== id));
  };

  const handleComplete = () => {
    triggerHaptic();
    onComplete({
      content: { 
        type: "text", 
        value: `${savedDates.length} dates saved!`
      },
      metadata: { 
        completedAt: Date.now(),
        datesCount: savedDates.length,
      },
    });
  };

  const isContactAdded = (contact: ContactInfo) => {
    return savedDates.some(
      d => d.name === contact.name && d.month === contact.month && d.day === contact.day
    );
  };

  const renderDateItem = ({ item }: { item: SavedDate }) => {
    const typeColors = getTypeColors(item.type);
    return (
      <Pressable 
        style={[styles.dateCard, { backgroundColor: theme.backgroundSecondary }]}
        onPress={() => handleEditDate(item)}
      >
        <View style={[styles.avatarContainer, { backgroundColor: typeColors.bgColor }]}>
          <Feather name={getIconForType(item.type) as any} size={22} color={typeColors.color} />
        </View>
        <View style={styles.dateInfo}>
          <ThemedText style={styles.dateName}>{item.name}</ThemedText>
          <View style={styles.infoRow}>
            <Feather name="calendar" size={14} color={theme.textSecondary} />
            <ThemedText style={[styles.infoText, { color: theme.textSecondary }]}>
              {formatDateDisplay(item.month, item.day, item.year)}
            </ThemedText>
          </View>
        </View>
        <Feather name="chevron-right" size={20} color={theme.textSecondary} />
      </Pressable>
    );
  };

  const renderSectionHeader = ({ section }: { section: DateSection }) => (
    <View style={[styles.sectionHeader, { backgroundColor: theme.backgroundDefault }]}>
      <ThemedText style={[styles.sectionTitle, { color: theme.text }]}>
        {section.title}
      </ThemedText>
    </View>
  );

  const renderContactItem = ({ item }: { item: ContactInfo }) => {
    const added = isContactAdded(item);
    
    return (
      <Pressable
        onPress={() => !added && handleAddFromContact(item)}
        style={[
          styles.contactCard, 
          { backgroundColor: theme.backgroundSecondary },
          added && styles.contactCardAdded
        ]}
        disabled={added}
      >
        <View style={[styles.avatarContainer, { backgroundColor: added ? theme.success + "20" : theme.primary + "20" }]}>
          <Feather name={added ? "check" : "gift"} size={24} color={added ? theme.success : theme.primary} />
        </View>
        <View style={styles.contactInfo}>
          <ThemedText style={styles.contactName}>{item.name}</ThemedText>
          <View style={styles.infoRow}>
            <Feather name="calendar" size={14} color={theme.textSecondary} />
            <ThemedText style={[styles.infoText, { color: theme.textSecondary }]}>
              {formatDateDisplay(item.month, item.day, item.year)}
            </ThemedText>
          </View>
        </View>
        {!added ? (
          <View style={[styles.addBadge, { backgroundColor: theme.primary }]}>
            <Feather name="plus" size={16} color="white" />
          </View>
        ) : null}
      </Pressable>
    );
  };

  if (!isStorageLoaded) {
    return (
      <ThemedView style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}>
        <View style={styles.centerContent}>
          <ThemedText>Loading...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (viewMode === "import") {
    if (!permission) {
      checkPermission();
      return (
        <ThemedView style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}>
          <View style={styles.centerContent}>
            <ThemedText>Checking permissions...</ThemedText>
          </View>
        </ThemedView>
      );
    }

    if (!permission.granted) {
      const canAskAgain = permission.status !== "denied" || permission.canAskAgain;
      
      return (
        <ThemedView style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}>
          <View style={styles.centerContent}>
            <View style={[styles.iconContainer, { backgroundColor: theme.border }]}>
              <Feather name="users" size={48} color={theme.text} />
            </View>
            
            <ThemedText style={styles.title}>
              Import Birthdays
            </ThemedText>
            
            <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
              Allow access to your contacts to find birthdays to add.
            </ThemedText>
          </View>

          <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
            {canAskAgain ? (
              <Pressable
                onPress={requestPermission}
                style={[styles.button, { backgroundColor: theme.primary }]}
              >
                <Feather name="unlock" size={18} color="white" style={{ marginRight: Spacing.sm }} />
                <ThemedText style={styles.buttonText}>Allow Access</ThemedText>
              </Pressable>
            ) : (
              <>
                <ThemedText style={[styles.deniedText, { color: theme.textSecondary }]}>
                  Permission denied. Enable in Settings.
                </ThemedText>
                {Platform.OS !== "web" ? (
                  <Pressable
                    onPress={() => Linking.openSettings()}
                    style={[styles.button, { backgroundColor: theme.primary }]}
                  >
                    <ThemedText style={styles.buttonText}>Open Settings</ThemedText>
                  </Pressable>
                ) : null}
              </>
            )}
            
            <Pressable onPress={() => setViewMode("list")} style={styles.skipButton}>
              <ThemedText style={[styles.skipText, { color: theme.textSecondary }]}>
                Back
              </ThemedText>
            </Pressable>
          </View>
        </ThemedView>
      );
    }

    return (
      <ThemedView style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}>
        {isLoading ? (
          <View style={styles.centerContent}>
            <ThemedText>Loading contacts...</ThemedText>
          </View>
        ) : contacts.length === 0 ? (
          <View style={styles.centerContent}>
            <View style={[styles.iconContainer, { backgroundColor: theme.border }]}>
              <Feather name="users" size={48} color={theme.text} />
            </View>
            <ThemedText style={styles.title}>No Birthdays Found</ThemedText>
            <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
              None of your contacts have birthday info.
            </ThemedText>
          </View>
        ) : (
          <ScrollView 
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            <ThemedText style={[styles.importHeader, { color: theme.textSecondary }]}>
              Tap to add a birthday to your dates
            </ThemedText>
            {contacts.map((contact) => (
              <View key={contact.id}>
                {renderContactItem({ item: contact })}
              </View>
            ))}
          </ScrollView>
        )}

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <Pressable
            onPress={() => setViewMode("list")}
            style={[styles.button, { backgroundColor: theme.primary }]}
          >
            <ThemedText style={styles.buttonText}>Done</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  if (viewMode === "add") {
    return (
      <ThemedView style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}>
        <KeyboardAwareScrollViewCompat 
          contentContainerStyle={styles.formContent}
          showsVerticalScrollIndicator={false}
          bottomOffset={120}
        >
          <View style={styles.formHeader}>
            <Pressable 
              onPress={resetForm} 
              style={styles.backButton}
              accessibilityLabel="Go back"
              accessibilityRole="button"
            >
              <Feather name="arrow-left" size={24} color={theme.text} />
            </Pressable>
            <ThemedText style={styles.formTitle}>{editingDateId ? "Edit Date" : "Add New Date"}</ThemedText>
            <View style={styles.backButton} />
          </View>
          
          <ThemedText style={[styles.label, { color: theme.textSecondary, marginBottom: Spacing.md }]}>
            {editingDateId ? "Edit date details" : "Add a new important date"}
          </ThemedText>
          
          <View style={styles.formSection}>
            <TextInput
              style={[styles.input, styles.inputLarge, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
              value={newDateName}
              onChangeText={setNewDateName}
              placeholder="What are you remembering?"
              placeholderTextColor={theme.textSecondary}
              returnKeyType="next"
              autoCapitalize="words"
              autoCorrect={false}
              accessibilityLabel="Name of the date to remember"
            />
          </View>
          
          <View style={styles.formSection}>
            <View style={styles.typeRow}>
              {DATE_TYPES.map((type) => (
                <Pressable
                  key={type.value}
                  onPress={() => {
                    triggerHaptic();
                    setNewDateType(type.value);
                  }}
                  style={[
                    styles.typeButton,
                    { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
                    newDateType === type.value && { backgroundColor: type.bgColor, borderColor: type.color }
                  ]}
                  accessibilityLabel={`${type.label} type`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: newDateType === type.value }}
                >
                  <Feather 
                    name={type.icon as any} 
                    size={24} 
                    color={newDateType === type.value ? type.color : theme.textSecondary} 
                  />
                  <ThemedText 
                    style={[
                      styles.typeLabel,
                      { color: newDateType === type.value ? type.color : theme.textSecondary }
                    ]}
                  >
                    {type.label}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          </View>
          
          <View style={styles.formSection}>
            {!newDateMonth ? (
              <View style={styles.monthGrid}>
                {MONTH_NAMES.map((month, index) => (
                  <Pressable
                    key={month}
                    onPress={() => {
                      triggerHaptic();
                      setNewDateMonth(index + 1);
                      setNewDateDay("");
                    }}
                    style={[
                      styles.monthButton,
                      { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }
                    ]}
                    accessibilityLabel={month}
                    accessibilityRole="button"
                  >
                    <ThemedText style={[styles.monthText, { color: theme.text }]}>
                      {month.slice(0, 3)}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View>
                <Pressable
                  onPress={() => {
                    triggerHaptic();
                    setNewDateMonth(null);
                    setNewDateDay("");
                  }}
                  style={[styles.selectedMonthHeader, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}
                  accessibilityLabel="Change month"
                  accessibilityRole="button"
                >
                  <Feather name="calendar" size={18} color={theme.text} />
                  <ThemedText style={[styles.selectedMonthText, { color: theme.text }]}>
                    {MONTH_NAMES[newDateMonth - 1]}
                  </ThemedText>
                  <ThemedText style={[styles.changeMonthText, { color: theme.textSecondary }]}>
                    Change
                  </ThemedText>
                </Pressable>
                
                <View style={styles.dayGrid}>
                  {Array.from({ length: getDaysInMonth(newDateMonth) }, (_, i) => i + 1).map((day) => (
                    <Pressable
                      key={day}
                      onPress={() => {
                        triggerHaptic();
                        setNewDateDay(day.toString());
                        yearInputRef.current?.focus();
                      }}
                      style={[
                        styles.dayButton,
                        { backgroundColor: theme.backgroundSecondary, borderColor: theme.border },
                        newDateDay === day.toString() && { backgroundColor: theme.primary, borderColor: theme.primary }
                      ]}
                      accessibilityLabel={`Day ${day}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: newDateDay === day.toString() }}
                    >
                      <ThemedText 
                        style={[
                          styles.dayButtonText,
                          { color: newDateDay === day.toString() ? "white" : theme.text }
                        ]}
                      >
                        {day}
                      </ThemedText>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>
          
          {newDateMonth && newDateDay ? (
            <View style={styles.formSection}>
              <TextInput
                ref={yearInputRef}
                style={[styles.input, styles.yearInputField, { backgroundColor: theme.backgroundSecondary, color: theme.text, borderColor: theme.border }]}
                value={newDateYear}
                onChangeText={setNewDateYear}
                placeholder="Year (optional)"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
                maxLength={4}
                returnKeyType="done"
                accessibilityLabel="Year, optional"
              />
            </View>
          ) : null}
          
          {newDateName && newDateMonth && newDateDay ? (() => {
            const previewColors = getTypeColors(newDateType);
            return (
              <View style={[styles.previewCard, { backgroundColor: theme.backgroundSecondary, borderColor: theme.border }]}>
                <View style={[styles.previewIcon, { backgroundColor: previewColors.bgColor }]}>
                  <Feather name={getIconForType(newDateType) as any} size={24} color={previewColors.color} />
                </View>
                <View style={styles.previewInfo}>
                  <ThemedText style={styles.previewName}>{newDateName}</ThemedText>
                  <ThemedText style={[styles.previewDate, { color: theme.textSecondary }]}>
                    {formatDateDisplay(newDateMonth, parseInt(newDateDay, 10) || 1, newDateYear ? parseInt(newDateYear, 10) : undefined)}
                  </ThemedText>
                </View>
              </View>
            );
          })() : null}
        </KeyboardAwareScrollViewCompat>

        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <Pressable
            onPress={handleAddCustomDate}
            style={[
              styles.button, 
              { backgroundColor: isFormValid ? theme.primary : theme.backgroundTertiary }
            ]}
            disabled={!isFormValid}
            accessibilityLabel="Save date"
            accessibilityRole="button"
            accessibilityState={{ disabled: !isFormValid }}
          >
            <Feather name="check" size={18} color={isFormValid ? "white" : theme.textSecondary} style={{ marginRight: Spacing.sm }} />
            <ThemedText style={[styles.buttonText, { color: isFormValid ? "white" : theme.textSecondary }]}>
              {editingDateId ? "Save Changes" : "Save Date"}
            </ThemedText>
          </Pressable>
          
          {editingDateId ? (
            <Pressable
              onPress={() => {
                handleDeleteDate(editingDateId);
                resetForm();
              }}
              style={[styles.deleteButtonFooter, { borderColor: theme.error || "#FF3B30" }]}
              accessibilityLabel="Delete date"
              accessibilityRole="button"
            >
              <Feather name="trash-2" size={18} color={theme.error || "#FF3B30"} style={{ marginRight: Spacing.sm }} />
              <ThemedText style={[styles.buttonText, { color: theme.error || "#FF3B30" }]}>
                Delete Date
              </ThemedText>
            </Pressable>
          ) : null}
        </View>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={[styles.container, { paddingTop: headerHeight + Spacing.lg }]}>
      {savedDates.length === 0 ? (
        <View style={styles.centerContent}>
          <View style={[styles.iconContainer, { backgroundColor: theme.border }]}>
            <Feather name="calendar" size={48} color={theme.text} />
          </View>
          <ThemedText style={styles.title}>Remember important dates</ThemedText>
          <ThemedText style={[styles.subtitle, { color: theme.textSecondary }]}>
            Add important dates you want to remember.
          </ThemedText>
          
          <View style={styles.emptyActions}>
            <Pressable
              onPress={() => setViewMode("add")}
              style={[styles.emptyButton, { backgroundColor: theme.primary }]}
            >
              <Feather name="plus" size={18} color="white" style={{ marginRight: Spacing.sm }} />
              <ThemedText style={styles.buttonText}>Add Date</ThemedText>
            </Pressable>
            
            <Pressable
              onPress={() => setViewMode("import")}
              style={[styles.emptyButton, { backgroundColor: theme.backgroundSecondary, borderWidth: 1, borderColor: theme.border }]}
            >
              <Feather name="users" size={18} color={theme.text} style={{ marginRight: Spacing.sm }} />
              <ThemedText style={[styles.buttonText, { color: theme.text }]}>Import from Contacts</ThemedText>
            </Pressable>
          </View>
        </View>
      ) : (
        <>
          <SectionList
            sections={sections}
            renderItem={renderDateItem}
            renderSectionHeader={renderSectionHeader}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled={true}
            ListHeaderComponent={
              <View style={styles.listHeader}>
                <ThemedText style={[styles.datesHeader, { color: theme.textSecondary }]}>
                  {savedDates.length} date{savedDates.length !== 1 ? "s" : ""} saved
                </ThemedText>
                <View style={styles.actionButtons}>
                  <Pressable
                    onPress={() => setViewMode("add")}
                    style={[styles.smallButton, { backgroundColor: theme.primary }]}
                  >
                    <Feather name="plus" size={16} color="white" />
                  </Pressable>
                  <Pressable
                    onPress={() => setViewMode("import")}
                    style={[styles.smallButton, { backgroundColor: theme.backgroundSecondary, marginLeft: Spacing.sm }]}
                  >
                    <Feather name="users" size={16} color={theme.text} />
                  </Pressable>
                </View>
              </View>
            }
          />
        </>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <Pressable
          onPress={handleComplete}
          style={[styles.button, { backgroundColor: theme.primary }]}
        >
          <ThemedText style={styles.buttonText}>Complete</ThemedText>
        </Pressable>

      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: Spacing.xl,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Spacing.xl,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
    marginBottom: Spacing.xl,
  },
  emptyActions: {
    width: "100%",
    gap: Spacing.md,
  },
  emptyButton: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  footer: {
    paddingHorizontal: Spacing.lg,
  },
  button: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  buttonText: {
    color: "white",
    fontWeight: "600",
    fontSize: 16,
  },
  skipButton: {
    padding: Spacing.md,
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  skipText: {
    fontSize: 14,
  },
  deniedText: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: Spacing.lg,
    lineHeight: 20,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  listHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  datesHeader: {
    fontSize: 14,
  },
  actionButtons: {
    flexDirection: "row",
  },
  smallButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    paddingTop: Spacing.md,
    marginBottom: Spacing.xs,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  badge: {
    marginLeft: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  dateCard: {
    flexDirection: "row",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    alignItems: "center",
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  dateInfo: {
    flex: 1,
    justifyContent: "center",
  },
  dateName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  deleteButton: {
    padding: Spacing.sm,
  },
  deleteButtonFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginTop: Spacing.md,
  },
  contactCard: {
    flexDirection: "row",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
    alignItems: "center",
  },
  contactCardAdded: {
    opacity: 0.6,
  },
  contactInfo: {
    flex: 1,
    justifyContent: "center",
  },
  contactName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: Spacing.xs,
  },
  addBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  infoText: {
    fontSize: 13,
    marginLeft: Spacing.xs,
  },
  importHeader: {
    fontSize: 14,
    marginBottom: Spacing.md,
  },
  formContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  formHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.xl,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  formTitle: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  formSection: {
    marginBottom: Spacing.xl,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: Spacing.md,
  },
  input: {
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    fontSize: 16,
    borderWidth: 1,
  },
  inputLarge: {
    minHeight: 56,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: Spacing.xs,
  },
  dayYearRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  dayInputWrapper: {
    flex: 1,
  },
  yearInputWrapper: {
    flex: 2,
  },
  dayInput: {
    textAlign: "center",
    fontSize: 20,
    fontWeight: "600",
    minHeight: 56,
  },
  yearInputField: {
    textAlign: "center",
    fontSize: 18,
    minHeight: 56,
  },
  monthSelector: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    minHeight: 56,
  },
  monthSelectorText: {
    flex: 1,
    fontSize: 16,
    marginLeft: Spacing.md,
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.sm,
  },
  monthButton: {
    width: "31%",
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  monthText: {
    fontSize: 14,
    fontWeight: "600",
  },
  selectedMonthHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    marginBottom: Spacing.md,
  },
  selectedMonthText: {
    fontSize: 16,
    fontWeight: "600",
    marginLeft: Spacing.sm,
    flex: 1,
  },
  changeMonthText: {
    fontSize: 13,
  },
  dayGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Spacing.xs,
  },
  dayButton: {
    width: "13%",
    aspectRatio: 1,
    borderRadius: BorderRadius.sm,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  dayButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  typeRow: {
    flexDirection: "row",
    gap: Spacing.sm,
  },
  typeButton: {
    flex: 1,
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: "center",
    borderWidth: 1,
    minHeight: 80,
    justifyContent: "center",
  },
  typeLabel: {
    fontSize: 13,
    marginTop: Spacing.sm,
    fontWeight: "600",
  },
  previewCard: {
    flexDirection: "row",
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    alignItems: "center",
    marginTop: Spacing.md,
  },
  previewIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginRight: Spacing.md,
  },
  previewInfo: {
    flex: 1,
  },
  previewName: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 2,
  },
  previewDate: {
    fontSize: 14,
  },
});
