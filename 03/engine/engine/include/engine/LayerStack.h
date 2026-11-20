#pragma once

#include <engine/Layer.h>
#include <engine/Types.h>

#include <cstddef>
#include <vector>

namespace engine {

class LayerStack {
public:
    LayerStack() = default;
    ~LayerStack();

    LayerStack(const LayerStack&) = delete;
    LayerStack& operator=(const LayerStack&) = delete;

    Layer* PushLayer(Scope<Layer> layer);
    Layer* PushOverlay(Scope<Layer> layer);
    bool PopLayer(Layer* layer);
    bool PopOverlay(Layer* layer);
    void Clear();

    // 由上而下派發;事件被標記 handled 後停止。
    void DispatchEvent(Event& event);

    using iterator = std::vector<Scope<Layer>>::iterator;
    using const_iterator = std::vector<Scope<Layer>>::const_iterator;
    using reverse_iterator = std::vector<Scope<Layer>>::reverse_iterator;
    using const_reverse_iterator = std::vector<Scope<Layer>>::const_reverse_iterator;

    iterator begin() { return m_Layers.begin(); }
    iterator end() { return m_Layers.end(); }
    const_iterator begin() const { return m_Layers.begin(); }
    const_iterator end() const { return m_Layers.end(); }
    reverse_iterator rbegin() { return m_Layers.rbegin(); }
    reverse_iterator rend() { return m_Layers.rend(); }
    const_reverse_iterator rbegin() const { return m_Layers.rbegin(); }
    const_reverse_iterator rend() const { return m_Layers.rend(); }

    std::size_t Size() const { return m_Layers.size(); }

private:
    std::vector<Scope<Layer>> m_Layers;
    std::size_t m_LayerInsertIndex = 0; // Overlay 之前的位置
};

} // namespace engine
