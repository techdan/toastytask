import { useState } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { Plus } from "lucide-react-native";
import type { Bucket } from "@toasty/contracts";
import { useCreateTask } from "@/hooks/useTasks";

interface QuickAddTaskProps {
  bucket: Bucket;
}

export function QuickAddTask({ bucket }: QuickAddTaskProps) {
  const [title, setTitle] = useState("");
  const createTask = useCreateTask();

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    try {
      await createTask.mutateAsync({
        title: trimmedTitle,
        bucket,
      });
      setTitle("");
    } catch {
      // Error is handled by the mutation
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="Add a task..."
        value={title}
        onChangeText={setTitle}
        onSubmitEditing={handleSubmit}
        returnKeyType="done"
        blurOnSubmit={false}
        editable={!createTask.isPending}
      />
      <TouchableOpacity
        style={[
          styles.button,
          (!title.trim() || createTask.isPending) && styles.buttonDisabled,
        ]}
        onPress={handleSubmit}
        disabled={!title.trim() || createTask.isPending}
      >
        {createTask.isPending ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Plus size={24} color="#fff" />
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    padding: 16,
    paddingBottom: 0,
    gap: 12,
  },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  button: {
    width: 48,
    height: 48,
    backgroundColor: "#f24c05",
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonDisabled: {
    backgroundColor: "#fca67a",
  },
});
