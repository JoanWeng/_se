#include <engine/LayerStack.h>

#include <engine/Assert.h>

#include <algorithm>

namespace engine {

LayerStack::~LayerStack() {
    Clear();
}

Layer* LayerStack::PushLayer(Scope<Layer> layer) {
    ENGINE_ASSERT(layer != nullptr, "Cannot push a null layer");

    Layer* raw = layer.get();
    m_Layers.insert(m_Layers.begin() + static_cast<std::ptrdiff_t>(m_LayerInsertIndex),
                    std::move(layer));
    ++m_LayerInsertIndex;

    raw->OnAttach();
    return raw;
}

Layer* LayerStack::PushOverlay(Scope<Layer> layer) {
    ENGINE_ASSERT(layer != nullptr, "Cannot push a null overlay");

    Layer* raw = layer.get();
    m_Layers.push_back(std::move(layer));

    raw->OnAttach();
    return raw;
}

bool LayerStack::PopLayer(Layer* layer) {
    const auto begin = m_Layers.begin();
    const auto end = begin + static_cast<std::ptrdiff_t>(m_LayerInsertIndex);
    const auto it = std::find_if(begin, end, [layer](const Scope<Layer>& entry) {
        return entry.get() == layer;
    });

    if (it == end) {
        return false;
    }

    (*it)->OnDetach();
    m_Layers.erase(it);
    --m_LayerInsertIndex;
    return true;
}

bool LayerStack::PopOverlay(Layer* layer) {
    const auto begin = m_Layers.begin() + static_cast<std::ptrdiff_t>(m_LayerInsertIndex);
    const auto end = m_Layers.end();
    const auto it = std::find_if(begin, end, [layer](const Scope<Layer>& entry) {
        return entry.get() == layer;
    });

    if (it == end) {
        return false;
    }

    (*it)->OnDetach();
    m_Layers.erase(it);
    return true;
}

void LayerStack::Clear() {
    for (auto& layer : m_Layers) {
        layer->OnDetach();
    }

    m_Layers.clear();
    m_LayerInsertIndex = 0;
}

void LayerStack::DispatchEvent(Event& event) {
    for (auto it = m_Layers.rbegin(); it != m_Layers.rend(); ++it) {
        (*it)->OnEvent(event);
        if (event.Handled()) {
            break;
        }
    }
}

} // namespace engine
